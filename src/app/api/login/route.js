// app/api/login/route.js
// Manuel (Credentials) login için güvenli proxy.
// Not: Tek oturum kaynağı NextAuth (custom JWT yok).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 6;
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;

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
    csrf: "Invalid CSRF token."
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
    csrf: "Geçersiz CSRF anahtarı."
  }
};

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.toLowerCase().startsWith("tr") ? "tr" : "en";
}
function getClientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : (req.headers.get("x-real-ip") || "unknown");
}

// "Set-Cookie" başlığındaki parçaları güvenle ayır
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}

// NextAuth'ın döndürebileceği tüm olası cookie adlarını toplayıp "a=b; c=d" döndür
function collectNextAuthCookies(setCookieHeader) {
  const wanted = new Set([
    "next-auth.csrf-token",
    "__secure-next-auth.csrf-token",
    "__host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__secure-next-auth.callback-url",
    "__host-next-auth.callback-url",
  ]);
  const pairs = [];
  for (const c of splitSetCookies(setCookieHeader)) {
    const pair = c.split(";")[0].trim(); // name=value
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const nameLower = pair.slice(0, eq).trim().toLowerCase();
      if (wanted.has(nameLower)) pairs.push(pair);
    }
  }
  return pairs.join("; ");
}

const DEBUG = process.env.DEBUG_AUTH === "1";
function withDebug(res, reason) {
  if (DEBUG && reason) res.headers.set("x-debug-reason", reason);
  return res;
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // 1) CSRF (header + cookie eşleşmeli)
    try {
      await validateCsrfToken(req);
    } catch {
      return NextResponse.json({ success: false, message: msg.csrf }, { status: 403 });
    }

    // 2) Rate limit
    const { ok, resetMs } = await checkRateLimit({
      key: `login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) {
      return new NextResponse(
        JSON.stringify({ success: false, message: msg.ratelimit }),
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetMs || RATE_LIMIT_WINDOW_MS) / 1000)),
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 3) Body
    let body;
    try { body = await req.json(); } catch { body = null; }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // 4) Kullanıcı & kapılar
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    if (user.role === "merchant") return NextResponse.json({ success: false, message: msg.merchant }, { status: 403 });
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return NextResponse.json({ success: false, message: msg.locked }, { status: 403 });
    }
    if (!user.passwordHash) return NextResponse.json({ success: false, message: msg.google }, { status: 401 });
    if (user.status !== "active") return NextResponse.json({ success: false, message: msg.inactive }, { status: 403 });

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
      return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    }
    // Başarılı → sayaçları sıfırla
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });

    // 6) NextAuth Credentials callback’e proxy
    // Base URL'i env'den zorunlu tercih et (proxy’lerde daha stabil)
    const scheme = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const requestOrigin = req.nextUrl?.origin || `${scheme}://${host}`;
    const baseUrl = (process.env.NEXTAUTH_URL || requestOrigin).replace(/\/$/, "");

    // a) CSRF token’ı /api/auth/signin?json=true ile al (cookie de set eder)
    const signinRes = await fetch(`${baseUrl}/api/auth/signin?json=true&callbackUrl=${encodeURIComponent(baseUrl)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
    });
    if (!signinRes.ok) {
      const res = NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
      return withDebug(res, "csrf_fetch_fail");
    }
    let signinJson = {};
    try { signinJson = await signinRes.json(); } catch {}
    const nextAuthCsrfToken = signinJson?.csrfToken;
    if (!nextAuthCsrfToken) {
      const res = NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
      return withDebug(res, "no_nextauth_csrf");
    }
    const cookieJar = collectNextAuthCookies(signinRes.headers.get("set-cookie") || "");

    // b) Credentials callback (redirect=false + json=true)
    const form = new URLSearchParams();
    form.set("csrfToken", nextAuthCsrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", baseUrl);

    const cbRes = await fetch(`${baseUrl}/api/auth/callback/credentials?json=true&redirect=false`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        ...(cookieJar ? { cookie: cookieJar } : {}),
      },
      body: form.toString(),
      redirect: "manual",
    });

    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch {}

    if (!cbRes.ok || cbJson?.error) {
      const res = NextResponse.json({ success: false, message: msg.fail }, { status: 401 });
      return withDebug(res, cbJson?.error ? `cb_error_${cbJson.error}` : `cb_status_${cbRes.status}`);
    }

    // c) Session çerezlerini forward et
    const res = NextResponse.json({ success: true, message: msg.success }, { status: 200 });
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    }
    res.headers.set("cache-control", "no-store");
    res.headers.set("vary", "cookie");
    return res;

  } catch {
    return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
  }
}
