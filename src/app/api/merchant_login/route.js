// app/api/merchant_login/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Merchant Credentials Login Proxy (NextAuth credentials callback)
 * - Zod input doğrulama
 * - Role gate: merchant + status=active
 * - IP & user rate limit
 * - 5 yanlış parola → 15dk kilit
 * - Origin/AJAX/Request-Id zorunlu (dev’de esneklik bayraklı)
 * - CSRF preload + NextAuth callback forward + Set-Cookie forward
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";

const RATE_LIMIT_PER_MIN = 5;
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;
const DEBUG = process.env.DEBUG_AUTH === "1";

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
  },
};

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.toLowerCase().startsWith("tr") ? "tr" : "en";
}
function withStd(res) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}
function debugHeader(res, reason) {
  if (DEBUG && reason) res.headers.set("x-debug-reason", reason);
  return res;
}
function splitSetCookies(headerVal) {
  return headerVal ? headerVal.split(/,(?=[^,; ]+=)/g) : [];
}
function containsSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return false;
  const lower = setCookieHeader.toLowerCase();
  return (
    lower.includes("next-auth.session-token=") ||
    lower.includes("__secure-next-auth.session-token=") ||
    lower.includes("__host-next-auth.session-token=")
  );
}

/** Origin builder — proxy/https güvenli */
function getOriginFromReq(req) {
  const xfHost = req.headers.get("x-forwarded-host");
  const host = (xfHost || req.headers.get("host") || "").trim();
  let proto = (req.headers.get("x-forwarded-proto") || "").toLowerCase();

  const isLocalLike =
    /^localhost(:\d+)?$/i.test(host) ||
    /^127\.0\.0\.1(:\d+)?$/.test(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);

  if (!proto) proto = isLocalLike ? "http" : "https";

  try {
    if (process.env.NEXTAUTH_URL) {
      const u = new URL(process.env.NEXTAUTH_URL);
      if (u.host === host) return u.origin;
    }
  } catch {}
  return `${proto}://${host}`;
}

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

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req) {
  // --- Security preflight
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
    requireOrigin(req);
    requireAjax(req);
  } catch (e) {
    return withStd(
      NextResponse.json(
        { success: false, error: e?.code || "bad_request", request_id: requestId },
        { status: e?.status || 400 }
      )
    );
  }

  const locale = pickLocale(req);
  const T = MSG[locale];

  // --- IP rate limit
  {
    const rlKey = makeRateLimitKey(req, { scope: "merchant_login:ip" });
    const { ok, resetMs } = await checkRateLimit({
      key: rlKey, limit: RATE_LIMIT_PER_MIN, windowMs: 60_000,
    });
    if (!ok) {
      const retry = Math.ceil((resetMs || 60_000) / 1000);
      audit({ evt: "merchant.login.ratelimit.ip", requestId });
      return withStd(
        NextResponse.json(
          { success: false, error: "too_many_requests", message: T.ratelimit, request_id: requestId, retry_after: retry },
          { status: 429, headers: { "Retry-After": String(retry) } }
        )
      );
    }
  }

  // --- Body parse/validate
  let data;
  try {
    data = BodySchema.parse(await req.json());
  } catch {
    return withStd(
      NextResponse.json(
        { success: false, error: "invalid_request", message: T.fill, request_id: requestId },
        { status: 400 }
      )
    );
  }

  const email = data.email.trim().toLowerCase();
  const password = data.password;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true, email: true, role: true, status: true, passwordHash: true,
        failedAttempts: true, lockUntil: true,
      },
    });

    const generic = () =>
      withStd(
        NextResponse.json(
          { success: false, error: "invalid_credentials", message: T.invalid, request_id: requestId },
          { status: 401 }
        )
      );

    if (!user) {
      audit({ evt: "merchant.login.invalid_email", email: email.slice(0, 3) + "***", requestId });
      return generic();
    }

    // user-level rate limit
    {
      const userKey = makeRateLimitKey(req, { scope: "merchant_login:user", userId: user.id });
      const { ok, resetMs } = await checkRateLimit({
        key: userKey, limit: RATE_LIMIT_PER_MIN, windowMs: 60_000,
      });
      if (!ok) {
        const retry = Math.ceil((resetMs || 60_000) / 1000);
        audit({ evt: "merchant.login.ratelimit.user", userId: user.id, requestId });
        return withStd(
          NextResponse.json(
            { success: false, error: "too_many_requests", message: T.ratelimit, request_id: requestId, retry_after: retry },
            { status: 429, headers: { "Retry-After": String(retry) } }
          )
        );
      }
    }

    // Gates
    if (user.role !== "merchant") {
      return withStd(
        NextResponse.json(
          { success: false, error: "forbidden", message: T.notMerchant, request_id: requestId },
          { status: 403 }
        )
      );
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return withStd(
        NextResponse.json(
          { success: false, error: "locked", message: T.locked, request_id: requestId },
          { status: 403 }
        )
      );
    }
    if (!user.passwordHash) return generic();
    if (user.status !== "active") {
      return withStd(
        NextResponse.json(
          { success: false, error: "pending", message: T.pending, request_id: requestId },
          { status: 403 }
        )
      );
    }

    // Password check + lock counter
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
      audit({ evt: "merchant.login.bad_password", userId: user.id, requestId });
      return generic();
    }

    // reset counters
    await prisma.user.update({
      where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null },
    });

    // NextAuth CSRF + callback
    const origin = getOriginFromReq(req);

    let csrfToken, cookieJar, csrfSetCookie;
    try {
      ({ token: csrfToken, cookieJar, csrfSetCookie } = await getNextAuthCsrf(origin));
    } catch (e) {
      audit({ evt: "merchant.login.csrf_fetch_fail", userId: user.id, requestId, err: e?.message });
      return debugHeader(
        withStd(
          NextResponse.json(
            { success: false, error: "server_error", message: T.fail, request_id: requestId },
            { status: 500 }
          )
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
          referer: `${origin}/merchant/login`,
        },
        body: form.toString(),
        redirect: "manual",
      }
    );

    const setCookieHeader = cbRes.headers.get("set-cookie") || "";
    let cbJson = {};
    try { cbJson = await cbRes.json(); } catch {}

    const okJson = cbRes.ok && !cbJson?.error;
    const okRedirectWithSession =
      (cbRes.status === 302 || cbRes.status === 303) &&
      containsSessionCookie(setCookieHeader);

    if (!okJson && !okRedirectWithSession) {
      audit({
        evt: "merchant.login.callback_fail",
        userId: user.id, requestId,
        status: cbRes.status, err: cbJson?.error || "unknown",
      });
      return debugHeader(
        withStd(
          NextResponse.json(
            { success: false, error: "auth_failed", message: T.fail, request_id: requestId },
            { status: 401 }
          )
        ),
        `cb_fail:${cbRes.status}:${cbJson?.error || "unknown"}`
      );
    }

    // forward cookies
    const res = debugHeader(
      withStd(NextResponse.json({ success: true, message: T.success, request_id: requestId }, { status: 200 })),
      okJson ? "ok:json" : "ok:302_session"
    );
    for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    for (const c of splitSetCookies(csrfSetCookie)) res.headers.append("set-cookie", c);

    audit({ evt: "merchant.login.ok", userId: user.id, requestId });
    return res;
  } catch (e) {
    audit({ evt: "merchant.login.exception", requestId, err: e?.message });
    return withStd(
      NextResponse.json(
        { success: false, error: "server_error", message: MSG[locale]?.fail || MSG.en.fail, request_id: requestId },
        { status: 500 }
      )
    );
  }
}
