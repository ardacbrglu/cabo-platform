export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/login
 * Manuel (Credentials) giriş → NextAuth session kurulumunu server-side proxy ile tamamlar.
 *
 * SECURITY
 * - CSRF: header (x-csrf-token | csrf-token | x-xsrf-token) + cookie (csrf_token) eşleşmesi zorunlu.
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

/** "Set-Cookie" header’ını güvenli şekilde parçalara ayır (expires virgülü bozmaz) */
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}

/** Gerekli NextAuth çerez çiftlerini (name=value) çıkarıp tek "cookie" değerine çevir */
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
    const pair = c.split(";")[0].trim(); // "name=value"
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const nameLower = pair.slice(0, eq).trim().toLowerCase();
      if (wanted.has(nameLower)) pairs.push(pair);
    }
  }
  return pairs.join("; ");
}

/** Set-Cookie içinden belirli bir çerezin değerini bul (ham value) */
function getCookieValueFromSetCookie(setCookieHeader, names) {
  const list = Array.isArray(names) ? names : [names];
  for (const c of splitSetCookies(setCookieHeader || "")) {
    const [name, ...rest] = c.split(";")[0].split("=");
    if (list.map(n => n.toLowerCase()).includes(name.trim().toLowerCase())) {
      return rest.join("=").trim(); // value (URL-encoded olabilir)
    }
  }
  return null;
}

/** next-auth.csrf-token çerezindeki "token|hash" formatından token’ı çıkar */
function extractTokenFromNextAuthCookie(cookieVal) {
  if (!cookieVal) return null;
  let decoded = cookieVal;
  try { decoded = decodeURIComponent(cookieVal); } catch {}
  const bar = decoded.indexOf("|");
  return bar > 0 ? decoded.slice(0, bar) : null;
}

/** NextAuth CSRF token ve cookieJar’ı elde et (csrf → fallback signin) */
async function getNextAuthCsrf(origin) {
  // 1) Standart yol: /api/auth/csrf
  try {
    const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
      method: "GET",
      headers: { accept: "application/json", "cache-control": "no-cache" },
      cache: "no-store",
      redirect: "manual",
    });
    if (csrfRes.ok) {
      const json = await csrfRes.json().catch(() => ({}));
      const token = json?.csrfToken;
      const cookieJar = collectNextAuthCookies(csrfRes.headers.get("set-cookie") || "");
      if (token && cookieJar) return { token, cookieJar };
    }
  } catch {
    // no-op; fallback'e geç
  }

  // 2) Fallback: /api/auth/signin → Set-Cookie: next-auth.csrf-token
  const signinRes = await fetch(`${origin}/api/auth/signin?callbackUrl=${encodeURIComponent(origin)}`, {
    method: "GET",
    headers: { accept: "text/html", "cache-control": "no-cache" },
    cache: "no-store",
    redirect: "manual",
  });
  if (!signinRes.ok) throw new Error("signin_fetch_failed");

  const setCookieHeader = signinRes.headers.get("set-cookie") || "";
  const cookieJar = collectNextAuthCookies(setCookieHeader);
  const rawCsrfCookie = getCookieValueFromSetCookie(setCookieHeader, [
    "next-auth.csrf-token",
    "__Secure-next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
  ]);
  const token = extractTokenFromNextAuthCookie(rawCsrfCookie);
  if (!token || !cookieJar) throw new Error("csrf_parse_failed");
  return { token, cookieJar };
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

    // 4) Kullanıcı kapıları
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    if (user.role === "merchant") return NextResponse.json({ success: false, message: msg.merchant }, { status: 403 });
    if (user.lockUntil && new Date(user.lockUntil) > new Date())
      return NextResponse.json({ success: false, message: msg.locked }, { status: 403 });
    if (!user.passwordHash) return NextResponse.json({ success: false, message: msg.google }, { status: 401 });
    if (user.status !== "active") return NextResponse.json({ success: false, message: msg.inactive }, { status: 403 });

    // 5) Parola kontrol + brute force sayaç
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

    // 6) NextAuth CSRF + cookieJar (fallback’li)
    const scheme = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host");
    const origin = req.nextUrl?.origin || `${scheme}://${host}`;

    let token, cookieJar;
    try {
      ({ token, cookieJar } = await getNextAuthCsrf(origin));
    } catch {
      return NextResponse.json({ success: false, message: msg.fail }, { status: 500 });
    }

    // 7) Credentials callback
    const form = new URLSearchParams();
    form.set("csrfToken", token);
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
    try { cbJson = await cbRes.json(); } catch {}
    if (!cbRes.ok || cbJson?.error) {
      // Hata kodunu kullanıcıya sızdırmıyoruz; generic mesaj
      return NextResponse.json({ success: false, message: msg.fail }, { status: 401 });
    }

    // 8) Session çerezlerini forward et
    const res = NextResponse.json({ success: true, message: msg.success }, { status: 200 });
    const setCookieHeader = cbRes.headers.get("set-cookie");
    if (setCookieHeader) {
      for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    }
    res.headers.set("cache-control", "no-store");
    res.headers.set("vary", "cookie");
    return res;

  } catch {
    return NextResponse.json({ success: false, message: MESSAGES[pickLocale(req)].fail }, { status: 500 });
  }
}
