export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/login
 * Manuel (Credentials) giriş → NextAuth session kurulumunu server-side proxy ile tamamlar.
 * Bu sürüm, tarayıcıdan gelen "__Host/__Secure/next-auth.csrf-token" çerezini DOĞRUDAN kullanır.
 * Böylece /api/auth/csrf veya /api/auth/signin'e iç fetch'e gerek kalmaz (500 kaynaklarını keser).
 *
 * SECURITY
 * - Platform CSRF: header (x-csrf-token | csrf-token | x-xsrf-token) + cookie (csrf_token) zorunlu.
 * - Rate limit: IP bazlı.
 * - Brute force: failedAttempts + 15 dk kilit.
 * - Tek oturum kaynağı NextAuth; custom JWT yok.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const RATE_LIMIT_WINDOW_MS = 60_000;
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

/** Request'in Cookie başlığından bir cookie'yi bul (ham değerini döndür) */
function findCookie(req, names) {
  const list = Array.isArray(names) ? names : [names];
  const header = req.headers.get("cookie") || "";
  for (const name of list) {
    const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
    const m = header.match(re);
    if (m) return m[1];
  }
  return null;
}

/** next-auth.csrf-token çerezi "token|hash" biçimindedir → form için yalnızca "token" gerekir */
function tokenFromNextAuthCookie(raw) {
  if (!raw) return null;
  let val = raw;
  try { val = decodeURIComponent(raw); } catch {}
  const i = val.indexOf("|");
  return i > 0 ? val.slice(0, i) : null;
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // 1) Platform CSRF
    try {
      validateCsrfToken(req);
    } catch {
      return NextResponse.json({ success: false, message: msg.csrf }, { status: 403 });
    }

    // 2) Rate limit
    const { ok } = await checkRateLimit({
      key: `login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) {
      return NextResponse.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // 3) Body
    let body;
    try { body = await req.json(); } catch { body = null; }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // 4) Kullanıcı kapıları
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    if (user.role === "merchant") return NextResponse.json({ success: false, message: msg.merchant }, { status: 403 });
    if (user.lockUntil && new Date(user.lockUntil) > new Date())
      return NextResponse.json({ success: false, message: msg.locked }, { status: 403 });
    if (!user.passwordHash) return NextResponse.json({ success: false, message: msg.google }, { status: 401 });
    if (user.status !== "active") return NextResponse.json({ success: false, message: msg.inactive }, { status: 403 });

    // 5) Parola kontrol + brute-force sayaç
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
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });

    // 6) NextAuth CSRF'i TARAYICIDAN AL
    //    Önce __Host/__Secure/standart adlardan biri var mı bak.
    const rawCsrfCookie = findCookie(req, [
      "__Host-next-auth.csrf-token",
      "__Secure-next-auth.csrf-token",
      "next-auth.csrf-token",
    ]);
    const nextAuthCsrfToken = tokenFromNextAuthCookie(rawCsrfCookie);

    // Cookie başlığından callback-url varsa onu da iletelim (zorunlu değil ama iyi olur)
    const rawCallbackCookie = findCookie(req, [
      "__Secure-next-auth.callback-url",
      "next-auth.callback-url",
      "__Host-next-auth.callback-url",
    ]);

    // Eğer tarayıcıdan NextAuth CSRF çerezi GELMİYORSA (nadirdir) → güvenli fallback olarak /api/auth/csrf
    let cookieJar = "";
    if (rawCsrfCookie) {
      // "Cookie" header formatı: "a=b; c=d"
      cookieJar = `__Host-next-auth.csrf-token=${rawCsrfCookie}`;
      // __Host yoksa diğer isimleri deneyelim:
      if (rawCsrfCookie && !cookieJar.startsWith("__Host-")) {
        cookieJar = `next-auth.csrf-token=${rawCsrfCookie}`;
      }
      if (rawCallbackCookie) {
        cookieJar += `; __Secure-next-auth.callback-url=${rawCallbackCookie}`;
      }
    } else {
      // Nadiren: çerez yoksa NextAuth'tan taze al
      const scheme = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("host");
      const origin = req.nextUrl?.origin || `${scheme}://${host}`;
      const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        redirect: "manual",
      });
      if (!csrfRes.ok) {
        return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
      }
      const j = await csrfRes.json().catch(() => ({}));
      if (!j?.csrfToken) {
        return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
      }
      // /api/auth/csrf yanıtındaki Set-Cookie'den jar oluştur
      const setCookie = csrfRes.headers.get("set-cookie") || "";
      // Basit ayıklama: ilk cookie çiftini al
      const first = setCookie.split(/,(?=[^,; ]+=)/g)[0]?.split(";")[0]?.trim();
      if (!first) return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
      cookieJar = first;
    }

    if (!nextAuthCsrfToken && !cookieJar) {
      return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
    }

    // 7) Credentials callback
    const scheme = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host");
    const origin = req.nextUrl?.origin || `${scheme}://${host}`;

    const form = new URLSearchParams();
    form.set("csrfToken", nextAuthCsrfToken || ""); // token varsa gönder
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", origin);

    const cbRes = await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        ...(cookieJar ? { cookie: cookieJar } : {}),
        origin,
        referer: `${origin}/login`,
      },
      body: form.toString(),
      redirect: "manual",
    });

    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch { /* no-op */ }

    if (!cbRes.ok || cbJson?.error) {
      // CredentialsSignin vb → generic mesaj (kasıtlı)
      return NextResponse.json({ success: false, message: msg.fail }, { status: 401 });
    }

    // 8) Session çerezlerini forward et
    const res = NextResponse.json({ success: true, message: msg.success }, { status: 200 });
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of setCookieHeader.split(/,(?=[^,; ]+=)/g)) {
        res.headers.append("set-cookie", c);
      }
    }
    res.headers.set("cache-control", "no-store");
    res.headers.set("vary", "cookie");
    return res;

  } catch {
    return NextResponse.json({ success: false, message: MESSAGES[locale].fail }, { status: 500 });
  }
}
