export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/login
 * Sorumluluk: Manuel (Credentials) giriş → NextAuth session kurulumunu server-side proxy ile tamamlar.
 *
 * SECURITY NOTES
 * - Tek oturum kaynağı NextAuth; custom JWT yok.
 * - CSRF: header (x-csrf-token | csrf-token | x-xsrf-token) + cookie (csrf_token) eşleşmesi zorunlu.
 * - Rate limit: IP bazlı (dk’da 6).
 * - Brute force: failedAttempts + 15 dk geçici lock.
 * - Yanıt: JSON; başarılıysa NextAuth’ın Set-Cookie’lerini forward eder.
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

/** "Set-Cookie" header’ını güvenli şekilde parçalara ayır (expires virgülü kırmaz) */
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}

/** NextAuth’ın ihtiyaç duyacağı çerez çiftlerini (name=value) çıkar ve tek "cookie" değerine çevir */
function collectNextAuthCookies(setCookieHeader) {
  const wanted = new Set([
    "next-auth.csrf-token",
    "__secure-next-auth.csrf-token",
    "__host-next-auth.csrf-token",
    // callback-url gerekli değil ama zararı da yok:
    "next-auth.callback-url",
    "__secure-next-auth.callback-url",
    "__host-next-auth.callback-url",
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
  // "Cookie" başlığı formatı: "a=b; c=d"
  return pairs.join("; ");
}

/** NextAuth callback JSON error kodunu kullanıcı mesajına çevir */
function mapNextAuthErrorToMsg(code, msg) {
  switch (code) {
    case "CredentialsSignin":
      return msg.invalid;            // E-posta/şifre yanlış
    case "OAuthAccountNotLinked":
    case "AccountNotLinked":
      return msg.google;             // Google-only kullanıcı
    case "CallbackRouteError":
    case "AccessDenied":
    default:
      return msg.fail;
  }
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // 1) CSRF
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

    // 4) Kullanıcı ve ön kapılar
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

    // 5) Parola doğrulama + brute force sayaçları
    const okPass = await bcrypt.compare(password, user.passwordHash);
    if (!okPass) {
      const nextFailed = (user.failedAttempts || 0) + 1;
      const willLock = nextFailed >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: nextFailed,
          lockUntil: willLock ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS) : user.lockUntil,
        },
      });
      return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    }
    // başarılı giriş → sayaç sıfırla
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockUntil: null },
    });

    // 6) NextAuth CSRF al ve cookie jar oluştur
    const scheme = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host");
    const origin = req.nextUrl?.origin || `${scheme}://${host}`;

    const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
      method: "GET",
      headers: { accept: "application/json", "cache-control": "no-cache" },
      cache: "no-store",
      redirect: "manual",
    });

    if (!csrfRes.ok) {
      return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
    }
    const csrfJson = await csrfRes.json().catch(() => ({}));
    const nextAuthCsrfToken = csrfJson?.csrfToken;
    if (!nextAuthCsrfToken) {
      return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
    }
    const cookieJar = collectNextAuthCookies(csrfRes.headers.get("set-cookie") || "");

    // 7) NextAuth Credentials callback (redirect=false + json=true)
    const form = new URLSearchParams();
    form.set("csrfToken", nextAuthCsrfToken);
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
        origin,                    // bazı dağıtımlarda yardımcı olur
        referer: `${origin}/login`,
      },
      body: form.toString(),
      redirect: "manual",
    });

    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch { /* no-op */ }

    if (!cbRes.ok || cbJson?.error) {
      const code = cbJson?.error || `HTTP_${cbRes.status}`;
      const message = mapNextAuthErrorToMsg(code, msg);
      return NextResponse.json({ success: false, message }, { status: 401 });
    }

    // 8) Session çerezlerini forward et
    const res = NextResponse.json({ success: true, message: msg.success }, { status: 200 });
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of splitSetCookies(setCookieHeader)) {
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
