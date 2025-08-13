// app/api/login/route.js
// Sorumluluk: Manuel login (Credentials) için güvenli giriş proxy'si.
// Google login zaten /api/auth/[...nextauth] üzerinden çalışır.
//
// SECURITY NOTES
// - Tek oturum kaynağı NextAuth; custom JWT yok.
// - CSRF: Header (x-csrf-token | csrf-token) + cookie (csrf_token) eşleşmesi zorunlu.
// - Rate limit: IP bazlı (6/dk).
// - Brute force: failedAttempts + lock (15 dk).
// - Yanıt: JSON; başarılıysa NextAuth session çerezlerini Set-Cookie ile geçirir.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;        // 1 dk
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

// Çoklu Set-Cookie başlığını güvenle ayır
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}
// Set-Cookie listesi içinden istenen cookie'nin "name=value" çiftini döndür
function pickCookiePair(setCookieHeader, cookieNameLower /* lower-case */) {
  for (const c of splitSetCookies(setCookieHeader)) {
    const pair = c.split(";")[0].trim(); // name=value
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const name = pair.slice(0, eq).trim().toLowerCase();
      if (name === cookieNameLower) return pair; // değeri aynen döndür
    }
  }
  return "";
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // 1) CSRF header+cookie doğrulaması
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

    // 3) Input
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // 4) Kullanıcı & kapılar
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    }
    if (user.role === "merchant") {
      return NextResponse.json({ success: false, message: msg.merchant }, { status: 403 });
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return NextResponse.json({ success: false, message: msg.locked }, { status: 403 });
    }
    if (!user.passwordHash) {
      return NextResponse.json({ success: false, message: msg.google }, { status: 401 });
    }
    if (user.status !== "active") {
      return NextResponse.json({ success: false, message: msg.inactive }, { status: 403 });
    }

    // 5) Parola doğrulama + brute-force sayaçları
    const okPass = await bcrypt.compare(password, user.passwordHash);
    if (!okPass) {
      const nextFailed = (user.failedAttempts || 0) + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: nextFailed,
          lockUntil:
            nextFailed >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS)
              : user.lockUntil,
        },
      });
      return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    }
    // Başarılı giriş → sayaçları sıfırla
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockUntil: null },
    });

    // 6) NextAuth Credentials callback’e sunucu-tarafı proxy
    const scheme = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const origin = req.nextUrl?.origin || `${scheme}://${host}`;

    // a) /api/auth/csrf → csrfToken + Set-Cookie(...)
    const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const csrfJson = await csrfRes.json().catch(() => ({}));
    const nextAuthCsrfToken = csrfJson?.csrfToken;
    if (!nextAuthCsrfToken) {
      return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
    }

    // Çerez kavanozu: olası iki CSRF cookie adı + callback-url
    const rawSetCookie = csrfRes.headers.get("set-cookie") || "";
    const cookieJar = [
      pickCookiePair(rawSetCookie, "__secure-next-auth.csrf-token"),
      pickCookiePair(rawSetCookie, "next-auth.csrf-token"),
      pickCookiePair(rawSetCookie, "next-auth.callback-url"),
    ]
      .filter(Boolean)
      .join("; ");

    // b) /api/auth/callback/credentials?json=true&redirect=false
    const form = new URLSearchParams();
    form.set("csrfToken", nextAuthCsrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", origin);

    const cbRes = await fetch(
      `${origin}/api/auth/callback/credentials?json=true&redirect=false`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          ...(cookieJar ? { cookie: cookieJar } : {}),
        },
        body: form.toString(),
        redirect: "manual",
      }
    );

    let cbJson = {};
    try {
      cbJson = await cbRes.json();
    } catch {}

    if (!cbRes.ok || cbJson?.error) {
      // İstemciye generic dön; (debug gerekirse reason alanını açabilirsiniz)
      return NextResponse.json(
        { success: false, message: msg.fail /*, reason: cbJson?.error */ },
        { status: 401 }
      );
    }

    // c) NextAuth session çerezlerini tek tek geçir
    const res = NextResponse.json(
      { success: true, message: msg.success },
      { status: 200 }
    );
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of splitSetCookies(setCookieHeader)) {
        res.headers.append("set-cookie", c);
      }
    }
    res.headers.set("cache-control", "no-store");
    return res;
  } catch {
    return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
  }
}
