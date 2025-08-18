// app/api/merchant_login/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/merchant_login — Merchant Credentials login proxy
 *
 * SECURITY CHAIN
 * CSRF → RateLimit → Validation → Role/Status kapıları → bcrypt → NextAuth callback → Session cookies forward
 *
 * Notlar:
 * - NextAuth CSRF/cookie-jar server-side alınır (/api/auth/csrf).
 * - Başarılı girişte NextAuth session çerezleri client’a forward edilir.
 * - Pending hesap “Satıcı hesabınız onay bekliyor.” şeklinde net mesaj alır.
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

const MSG = {
  en: {
    fill: "Please enter your email and password.",
    invalid: "Incorrect email or password.",
    notMerchant: "You cannot log in here with this account.",
    pending: "Your merchant account is pending approval.",
    locked: "Too many failed attempts. Please try again later.",
    success: "Login successful!",
    fail: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait.",
    csrf: "Invalid CSRF token.",
  },
  tr: {
    fill: "Lütfen e-posta ve şifrenizi girin.",
    invalid: "E-posta veya şifre yanlış.",
    notMerchant: "Bu hesapla buradan giriş yapamazsınız.",
    pending: "Satıcı hesabınız onay bekliyor.",
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

// Güvenli Set-Cookie parçalama (expires virgülünden etkilenmez)
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

// Yanıtta session çerezi var mı (başarı göstergesi)?
function containsSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return false;
  const lower = setCookieHeader.toLowerCase();
  return (
    lower.includes("next-auth.session-token=") ||
    lower.includes("__secure-next-auth.session-token=") ||
    lower.includes("__host-next-auth.session-token=")
  );
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

export async function POST(req) {
  const locale = pickLocale(req);
  const T = MSG[locale];
  const ip = getClientIp(req);

  try {
    // 1) CSRF
    try { validateCsrfToken(req); }
    catch { return NextResponse.json({ success: false, message: T.csrf }, { status: 403 }); }

    // 2) Rate limit
    const { ok } = await checkRateLimit({
      key: `merchant_login:ip:${ip}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) return NextResponse.json({ success: false, message: T.ratelimit }, { status: 429 });

    // 3) Body
    let body; try { body = await req.json(); } catch { body = null; }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return NextResponse.json({ success: false, message: T.fill }, { status: 400 });
    }

    // 4) Kullanıcı & kapılar
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ success: false, message: T.invalid }, { status: 401 });

    if (user.role !== "merchant") {
      return NextResponse.json({ success: false, message: T.notMerchant }, { status: 403 });
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return NextResponse.json({ success: false, message: T.locked }, { status: 403 });
    }
    if (!user.passwordHash) {
      // Parolası olmayan hesap (credentials ile giriş yapılamaz)
      return NextResponse.json({ success: false, message: T.invalid }, { status: 401 });
    }
    if (user.status !== "active") {
      // Pending → net mesaj (NextAuth’a gitmeden burada kes)
      return NextResponse.json({ success: false, message: T.pending }, { status: 403 });
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
      return NextResponse.json({ success: false, message: T.invalid }, { status: 401 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });

    // 6) NextAuth CSRF + cookie-jar (server-side)
    const scheme = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host");
    const origin = process.env.NEXTAUTH_URL || `${scheme}://${host}`;

    let csrfToken, cookieJar, csrfSetCookie;
    try {
      ({ token: csrfToken, cookieJar, setCookieHeader: csrfSetCookie } = await getNextAuthCsrf(origin));
    } catch (e) {
      return withDebug(
        NextResponse.json({ success: false, message: T.fail }, { status: 500 }),
        `csrf_err:${e?.message || "err"}`
      );
    }

    // 7) NextAuth Credentials callback (redirect=false)
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
        cookie: cookieJar,
        origin,
        referer: `${origin}/merchant`,
      },
      body: form.toString(),
      redirect: "manual",
    });

    const setCookieHeader = cbRes.headers.get("set-cookie") || "";
    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch {}

    const okJson = cbRes.ok && !cbJson?.error;
    const okRedirectWithSession =
      (cbRes.status === 302 || cbRes.status === 303) && containsSessionCookie(setCookieHeader);

    if (!okJson && !okRedirectWithSession) {
      // Teoride buraya düşmemeliyiz; kapılar üstte zaten kesiyor.
      return withDebug(
        NextResponse.json({ success: false, message: T.fail }, { status: 401 }),
        `cb_fail:${cbRes.status}:${cbJson?.error || "unknown"}`
      );
    }

    // 8) Session çerezlerini forward et (+ CSRF çağrısından gelen faydalı çerezler)
    const res = withDebug(
      NextResponse.json({ success: true, message: T.success }, { status: 200 }),
      okJson ? "ok:json" : "ok:302_session"
    );
    for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    for (const c of splitSetCookies(csrfSetCookie)) res.headers.append("set-cookie", c);

    res.headers.set("cache-control", "no-store");
    res.headers.set("vary", "cookie");
    return res;

  } catch (e) {
    return withDebug(
      NextResponse.json({ success: false, message: MSG[pickLocale(req)].fail }, { status: 500 }),
      `outer:${e?.message || "err"}`
    );
  }
}
