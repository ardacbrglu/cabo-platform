// app/api/login/route.js
// Manuel (Credentials) giriş için güvenli proxy.
// Tek oturum kaynağı NextAuth; custom JWT yok.

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma/crypto için Node runtime

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 dk
const RATE_LIMIT_COUNT = 6;
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 dk

const MESSAGES = {
  en: {
    fill: "Please enter your email and password.",
    invalid: "Incorrect email or password.",
    merchant: "Merchants cannot log in here.",
    google: "You signed up with Google. Please use Google login.",
    inactive: "Your account has not been activated yet.",
    locked: "Too many failed attempts. Please try again later.",
    success: "Login successful!",
    fail: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait.",
    csrf: "Invalid CSRF token.",
  },
  tr: {
    fill: "Lütfen e-posta ve şifrenizi girin.",
    invalid: "E-posta veya şifre yanlış.",
    merchant: "Satıcı hesapları buradan giriş yapamaz.",
    google: "Google ile kayıt oldunuz. Lütfen Google ile giriş yapın.",
    inactive: "Hesabınız henüz aktifleştirilmedi.",
    locked: "Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.",
    success: "Giriş başarılı!",
    fail: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen bekleyin.",
    csrf: "Geçersiz CSRF anahtarı.",
  },
};

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.toLowerCase().startsWith("tr") ? "tr" : "en";
}
function getClientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : (req.headers.get("x-real-ip") || "unknown");
}

// Çoklu "Set-Cookie" başlığını güvenle parçala
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}

// NextAuth’ın döndüğü CSRF/Callback cookie’lerini topla → "a=b; c=d" şeklinde döner
function collectNextAuthCookies(setCookieHeader) {
  const wanted = new Set([
    "__secure-next-auth.csrf-token",
    "__host-next-auth.csrf-token",
    "next-auth.csrf-token",
    "__secure-next-auth.callback-url",
    "__host-next-auth.callback-url",
    "next-auth.callback-url",
  ]);
  const pairs = [];
  for (const c of splitSetCookies(setCookieHeader)) {
    const pair = c.split(";")[0].trim(); // "name=value"
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const nameLower = pair.slice(0, eq).trim().toLowerCase();
      if (wanted.has(nameLower)) pairs.push(pair);
    }
  }
  return pairs.join("; ");
}

// Yardımcı: tek noktadan JSON & header ile dön
function jsonWithReason(body, { status = 200, reason = "" } = {}) {
  const res = NextResponse.json(body, { status });
  if (reason) res.headers.set("X-Debug-Reason", reason);
  res.headers.set("cache-control", "no-store");
  return res;
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // 1) CSRF zorunlu
    try {
      await validateCsrfToken(req);
    } catch {
      return jsonWithReason({ success: false, message: msg.csrf, reason: "csrf_mismatch" }, { status: 403, reason: "csrf_mismatch" });
    }

    // 2) Rate limit
    const { ok, resetMs } = await checkRateLimit({
      key: `login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) {
      const headers = {
        "Retry-After": String(Math.ceil((resetMs || RATE_LIMIT_WINDOW_MS) / 1000)),
        "Content-Type": "application/json",
      };
      const res = NextResponse.json({ success: false, message: msg.ratelimit, reason: "rate_limited" }, { status: 429, headers });
      res.headers.set("X-Debug-Reason", "rate_limited");
      return res;
    }

    // 3) Input
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonWithReason({ success: false, message: msg.fill, reason: "bad_json" }, { status: 400, reason: "bad_json" });
    }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return jsonWithReason({ success: false, message: msg.fill, reason: "missing_fields" }, { status: 400, reason: "missing_fields" });
    }

    // 4) Kullanıcı kapıları
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return jsonWithReason({ success: false, message: msg.invalid, reason: "no_user" }, { status: 401, reason: "no_user" });
    if (user.role === "merchant") return jsonWithReason({ success: false, message: msg.merchant, reason: "role_merchant" }, { status: 403, reason: "role_merchant" });
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) return jsonWithReason({ success: false, message: msg.locked, reason: "locked" }, { status: 403, reason: "locked" });
    if (!user.passwordHash) return jsonWithReason({ success: false, message: msg.google, reason: "google_only" }, { status: 401, reason: "google_only" });
    if (user.status !== "active") return jsonWithReason({ success: false, message: msg.inactive, reason: "inactive" }, { status: 403, reason: "inactive" });

    // 5) Parola + brute-force sayaçları
    const okPass = await bcrypt.compare(password, user.passwordHash);
    if (!okPass) {
      const nextFailed = (user.failedAttempts || 0) + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: nextFailed,
          lockUntil: nextFailed >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS)
            : user.lockUntil,
        },
      });
      return jsonWithReason({ success: false, message: msg.invalid, reason: "bad_password" }, { status: 401, reason: "bad_password" });
    }
    // Başarılı → sayaç sıfırla
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });

    // 6) NextAuth Credentials callback’e proxy
    const scheme = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host");
    const origin = req.nextUrl?.origin || `${scheme}://${host}`;

    // a) /api/auth/csrf
    let csrfJson, csrfSetCookie;
    try {
      const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      csrfSetCookie = csrfRes.headers.get("set-cookie") || "";
      csrfJson = await csrfRes.json().catch(() => ({}));
    } catch (e) {
      return jsonWithReason({ success: false, message: msg.fail, reason: "csrf_fetch_fail" }, { status: 500, reason: "csrf_fetch_fail" });
    }
    const nextAuthCsrfToken = csrfJson?.csrfToken;
    if (!nextAuthCsrfToken) {
      return jsonWithReason({ success: false, message: msg.fail, reason: "csrf_missing" }, { status: 500, reason: "csrf_missing" });
    }
    const cookieJar = collectNextAuthCookies(csrfSetCookie);

    // b) /api/auth/callback/credentials (redirect=false + json=true)
    const form = new URLSearchParams();
    form.set("csrfToken", nextAuthCsrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", origin);

    let cbRes, cbJson;
    try {
      cbRes = await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          ...(cookieJar ? { cookie: cookieJar } : {}),
        },
        body: form.toString(),
        redirect: "manual",
      });
      // 200/401/400 haricinde 302 de gelebilir; json okunabilir olmayabilir
      cbJson = await cbRes.json().catch(() => ({}));
    } catch (e) {
      return jsonWithReason({ success: false, message: msg.fail, reason: "callback_fetch_fail" }, { status: 500, reason: "callback_fetch_fail" });
    }

    if (!cbRes.ok || cbJson?.error) {
      const reason = cbJson?.error ? `callback_${String(cbJson.error)}` : `callback_status_${cbRes.status}`;
      return jsonWithReason({ success: false, message: msg.fail, reason }, { status: 401, reason });
    }

    // c) Oturum çerezlerini geçir
    const res = NextResponse.json({ success: true, message: msg.success }, { status: 200 });
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    }
    res.headers.set("cache-control", "no-store");
    return res;

  } catch (e) {
    // Log’u istersen buraya ekle
    return jsonWithReason({ success: false, message: MESSAGES[pickLocale(req)].fail, reason: "unhandled" }, { status: 500, reason: "unhandled" });
  }
}
