// app/api/login/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/login — Credentials login'i server-side proxy eder.
 * Zincir: Platform CSRF → RateLimit → Kapılar → bcrypt → NextAuth callback
 * Not: NextAuth CSRF/callback çerezleri, tarayıcıdan değil, sunucu içinden /api/auth/csrf ile alınır.
 * 200 JSON veya 302/303 + session Set-Cookie gelirse başarı kabul edilir.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const DEBUG = process.env.DEBUG_AUTH === "1";

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
function withDebug(res, reason) {
  if (DEBUG && reason) res.headers.set("x-debug-reason", reason);
  return res;
}

// Set-Cookie başlığını güvenli parçala (expires virgülü bozmaz)
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}

// /api/auth/csrf yanıtından gerekli NextAuth çerezlerini tek "cookie" header'ına topla
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
  for (const c of splitSetCookies(setCookieHeader || "")) {
    const pair = c.split(";")[0].trim(); // name=value
    const i = pair.indexOf("=");
    if (i > 0) {
      const nameLower = pair.slice(0, i).trim().toLowerCase();
      if (wanted.has(nameLower)) pairs.push(pair);
    }
  }
  return pairs.join("; ");
}

// Set-Cookie içinden belirli çerezin ham değerini al
function getCookieValueFromSetCookie(setCookieHeader, names) {
  const list = Array.isArray(names) ? names : [names];
  for (const c of splitSetCookies(setCookieHeader || "")) {
    const [name, ...rest] = c.split(";")[0].split("=");
    if (list.map(n => n.toLowerCase()).includes(name.trim().toLowerCase())) {
      return rest.join("=").trim();
    }
  }
  return null;
}

// "token|hash" biçiminden token'ı çıkar
function extractTokenFromNextAuthCookie(cookieVal) {
  if (!cookieVal) return null;
  let decoded = cookieVal;
  try { decoded = decodeURIComponent(cookieVal); } catch {}
  const bar = decoded.indexOf("|");
  return bar > 0 ? decoded.slice(0, bar) : null;
}

// Sunucu içinden NextAuth CSRF + cookie-jar al
async function getNextAuthCsrf(origin) {
  const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
    method: "GET",
    headers: { accept: "application/json", "cache-control": "no-cache" },
    cache: "no-store",
    redirect: "manual",
  });
  if (!csrfRes.ok) throw new Error(`csrf_fetch_${csrfRes.status}`);
  const json = await csrfRes.json().catch(() => ({}));
  const token = json?.csrfToken;
  const setCookieHeader = csrfRes.headers.get("set-cookie") || "";
  const cookieJar = collectNextAuthCookies(setCookieHeader);
  if (!token || !cookieJar) throw new Error("csrf_parse");
  return { token, cookieJar, setCookieHeader };
}

// Yanıtta session çerezi var mı (başarı göstergesi)?
function containsSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return false;
  const lower = setCookieHeader.toLowerCase();
  // farklı dağıtımlarda __Secure- veya __Host- prefix'leri olabilir
  return (
    lower.includes("next-auth.session-token=") ||
    lower.includes("__secure-next-auth.session-token=") ||
    lower.includes("__host-next-auth.session-token=")
  );
}

export async function POST(req) {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // 1) Platform CSRF
    try { validateCsrfToken(req); }
    catch { return NextResponse.json({ success: false, message: msg.csrf }, { status: 403 }); }

    // 2) Rate limit
    const { ok } = await checkRateLimit({
      key: `login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) return NextResponse.json({ success: false, message: msg.ratelimit }, { status: 429 });

    // 3) Body
    let body; try { body = await req.json(); } catch { body = null; }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return NextResponse.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // 4) Kapılar
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: false, message: msg.invalid }, { status: 401 });
    if (user.role === "merchant") return NextResponse.json({ success: false, message: msg.merchant }, { status: 403 });
    if (user.lockUntil && new Date(user.lockUntil) > new Date())
      return NextResponse.json({ success: false, message: msg.locked }, { status: 403 });
    if (!user.passwordHash) return NextResponse.json({ success: false, message: msg.google }, { status: 401 });
    if (user.status !== "active") return NextResponse.json({ success: false, message: msg.inactive }, { status: 403 });

    // 5) Parola
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

    // 6) NextAuth CSRF + cookie-jar (sunucu içinden)
    const scheme = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host");
    const origin = process.env.NEXTAUTH_URL || `${scheme}://${host}`;

    let csrfToken, cookieJar, csrfSetCookie;
    try {
      ({ token: csrfToken, cookieJar, setCookieHeader: csrfSetCookie } = await getNextAuthCsrf(origin));
    } catch (e) {
      return withDebug(
        NextResponse.json({ success: false, message: msg.fail }, { status: 500 }),
        `csrf_err:${e?.message || "err"}`
      );
    }

    // 7) Credentials callback
    const form = new URLSearchParams();
    form.set("csrfToken", csrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("redirect", "false");
    form.set("callbackUrl", origin);

    const cbRes = await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        cookie: cookieJar,           // Yalnız NextAuth çerezleri
        origin,
        referer: `${origin}/login`,
      },
      body: form.toString(),
      redirect: "manual",
    });

    const setCookieHeader = cbRes.headers.get("set-cookie") || "";
    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch { /* JSON olmayabilir */ }

    const okJson = cbRes.ok && !cbJson?.error;
    const okRedirectWithSession =
      (cbRes.status === 302 || cbRes.status === 303) && containsSessionCookie(setCookieHeader);

    if (!okJson && !okRedirectWithSession) {
      return withDebug(
        NextResponse.json({ success: false, message: msg.fail }, { status: 401 }),
        `cb_fail:${cbRes.status}:${cbJson?.error || "unknown"}`
      );
    }

    // 8) Session çerezlerini forward et (CSRF isteğinden gelenleri de ekleyelim ki tarayıcı tutarlı olsun)
    const res = withDebug(
      NextResponse.json({ success: true, message: msg.success }, { status: 200 }),
      okJson ? "ok:json" : "ok:302_session"
    );
    // önce callback'in Set-Cookie'leri
    for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    // ardından CSRF çağrısından gelen (callback-url vs.) faydalı çerezler (tekrarlar zararsız)
    for (const c of splitSetCookies(csrfSetCookie)) res.headers.append("set-cookie", c);

    res.headers.set("cache-control", "no-store");
    res.headers.set("vary", "cookie");
    return res;

  } catch (e) {
    return withDebug(
      NextResponse.json({ success: false, message: MESSAGES[pickLocale(req)].fail }, { status: 500 }),
      `outer:${e?.message || "err"}`
    );
  }
}
