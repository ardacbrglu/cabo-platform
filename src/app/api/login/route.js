export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/login/route.js
 * Purpose: Credentials login için server-side proxy (NextAuth callback) + politika/limit/lock.
 *
 * Security Notes:
 * - CSRF: Özel CSRF kütüphanesi yok. Origin/Referer eşleşmesi + X-Requested-With + X-Request-Id zorunlu.
 * - RateLimit: 5/dk (IP). Başarısız denemelerde lock/backoff.
 * - Validation: Zod ile e-posta/şifre kontrolü.
 * - RBAC: Merchant kullanıcılar buradan giremez.
 * - Status: Yalnız status === "active" kullanıcılar giriş yapabilir.
 * - Audit: success/failure olayları JSON log.
 * - Session: NextAuth /api/auth/callback/credentials çağrısı sunucudan yapılır; Set-Cookie başlıkları forward edilir.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

const DEBUG = process.env.DEBUG_AUTH === "1";
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
  },
};

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.toLowerCase().startsWith("tr") ? "tr" : "en";
}

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

function debugHeader(res, reason) {
  if (DEBUG && reason) res.headers.set("x-debug-reason", reason);
  return res;
}

// Birden çok Set-Cookie başlığını güvenli böl
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}

// Session cookie içeriyor mu?
function containsSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return false;
  const lower = setCookieHeader.toLowerCase();
  return (
    lower.includes("next-auth.session-token=") ||
    lower.includes("__secure-next-auth.session-token=") ||
    lower.includes("__host-next-auth.session-token=")
  );
}

// Reverse proxy arkasında sağlam origin üret
function getOrigin(req) {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  const scheme = xfProto || req.headers.get("x-forwarded-proto") || "https";
  const host = xfHost || req.headers.get("host");
  return `${scheme}://${host}`;
}

// Sunucudan NextAuth CSRF → callback için gerekli cookie jar
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
  const jar = splitSetCookies(setCookieHeader)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  if (!token || !jar) throw new Error("csrf_parse");
  return { token, cookieJar: jar, csrfSetCookie: setCookieHeader };
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req) {
  const requestId = requireRequestId(req);
  requireOrigin(req);
  requireAjax(req);

  const locale = pickLocale(req);
  const msg = MESSAGES[locale];

  // 1) Rate limit 5/dk (IP)
  const rlKey = makeRateLimitKey(req, { scope: "login" });
  const rl = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    const res = NextResponse.json(
      { success: false, message: msg.ratelimit, request_id: requestId },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    );
    audit({ evt: "login.ratelimit", requestId });
    return withHeaders(res);
  }

  // 2) Body doğrulama
  let body;
  try {
    body = LoginSchema.parse(await req.json());
  } catch {
    return withHeaders(
      NextResponse.json({ success: false, message: msg.fill, request_id: requestId }, { status: 400 })
    );
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password;

  // 3) Kullanıcı kapıları
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      status: true,
      failedAttempts: true,
      lockUntil: true,
      accounts: { select: { provider: true }, take: 1 },
    },
  });

  const generic = () =>
    withHeaders(
      NextResponse.json({ success: false, message: msg.invalid, request_id: requestId }, { status: 401 })
    );

  if (!user) return generic();
  if (user.role === "merchant") {
    return withHeaders(
      NextResponse.json({ success: false, message: msg.merchant, request_id: requestId }, { status: 403 })
    );
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    return withHeaders(
      NextResponse.json({ success: false, message: msg.locked, request_id: requestId }, { status: 403 })
    );
  }
  const isGoogleOnly = !user.passwordHash && user.accounts?.some?.((a) => a.provider === "google");
  if (isGoogleOnly) {
    return withHeaders(
      NextResponse.json({ success: false, message: msg.google, request_id: requestId }, { status: 403 })
    );
  }
  if (user.status !== "active") {
    return withHeaders(
      NextResponse.json({ success: false, message: msg.inactive, request_id: requestId }, { status: 403 })
    );
  }

  // 4) Parola kontrolü + lock sayacı
  const match = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!match) {
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
    audit({ evt: "login.fail", userId: user.id, attempts: nextFailed, requestId });
    return generic();
  }

  // 5) Sayaç sıfırla
  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockUntil: null },
  });

  // 6) NextAuth CSRF & callback (sunucudan)
  const origin = getOrigin(req);

  let csrfToken, cookieJar, csrfSetCookie;
  try {
    ({ token: csrfToken, cookieJar, csrfSetCookie } = await getNextAuthCsrf(origin));
  } catch (e) {
    audit({ evt: "login.csrf_fetch_error", userId: user.id, reason: e?.message, requestId });
    return debugHeader(
      withHeaders(
        NextResponse.json({ success: false, message: msg.fail, request_id: requestId }, { status: 500 })
      ),
      `csrf_err:${e?.message || "err"}`
    );
  }

  const form = new URLSearchParams();
  form.set("csrfToken", csrfToken);
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
        cookie: cookieJar,
        origin,
        referer: `${origin}/login`,
      },
      body: form.toString(),
      redirect: "manual",
    }
  );

  const setCookieHeader = cbRes.headers.get("set-cookie") || "";
  let cbJson = {};
  try {
    cbJson = await cbRes.json();
  } catch {}

  const okJson = cbRes.ok && !cbJson?.error;
  const okRedirectWithSession =
    (cbRes.status === 302 || cbRes.status === 303) && containsSessionCookie(setCookieHeader);

  if (!okJson && !okRedirectWithSession) {
    audit({
      evt: "login.callback_fail",
      userId: user.id,
      status: cbRes.status,
      err: cbJson?.error,
      requestId,
    });
    return debugHeader(
      withHeaders(
        NextResponse.json({ success: false, message: msg.fail, request_id: requestId }, { status: 401 })
      ),
      `cb_fail:${cbRes.status}:${cbJson?.error || "unknown"}`
    );
  }

  // 7) Session çerezlerini forward et (+ CSRF çerezleri)
  const res = debugHeader(
    withHeaders(
      NextResponse.json({ success: true, message: msg.success, request_id: requestId }, { status: 200 })
    ),
    okJson ? "ok:json" : "ok:302_session"
  );

  for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
  for (const c of splitSetCookies(csrfSetCookie)) res.headers.append("set-cookie", c);

  audit({ evt: "login.ok", userId: user.id, requestId });
  return res;
}
