export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Merchant credentials login proxy (NextAuth Credentials)
 * - Origin/Referer, X-Requested-With, X-Request-Id
 * - IP + userId rate limit
 * - Zod validation
 * - Gates: role=merchant, status=active, lockUntil, bcrypt compare
 * - Forwards NextAuth Set-Cookie
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_COUNT = 5;
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

function tFactory(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  const locale = raw.toLowerCase().startsWith("tr") ? "tr" : "en";
  return { T: MSG[locale], locale };
}
function withStd(res) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

// --- cookie helpers (NextAuth callback piping) ---
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
async function getNextAuthCsrf(origin) {
  const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
    method: "GET",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    cache: "no-store",
    redirect: "manual",
  });
  if (!csrfRes.ok) throw new Error(`csrf_fetch_${csrfRes.status}`);
  const json = await csrfRes.json().catch(() => ({}));
  const token = json?.csrfToken;
  const setCookieHeader = csrfRes.headers.get("set-cookie") || "";
  const jar = splitSetCookies(setCookieHeader)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
  if (!token || !jar) throw new Error("csrf_parse");
  return { token, cookieJar: jar, setCookieHeader };
}

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req) {
  const requestId = requireRequestId(req);
  requireOrigin(req);
  requireAjax(req);

  const { T } = tFactory(req);

  // 1) Rate limit (IP)
  const ipRl = await checkRateLimit({
    key: makeRateLimitKey(req, { scope: "merchant_login:ip" }),
    limit: RATE_LIMIT_COUNT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!ipRl.ok) {
    audit({ evt: "merchant.login.ratelimit.ip", requestId });
    return withStd(
      NextResponse.json(
        {
          success: false,
          error: "too_many_requests",
          message: T.ratelimit,
          request_id: requestId,
          retry_after: Math.ceil(ipRl.resetMs / 1000),
        },
        { status: 429 },
      ),
    );
  }

  // 2) Body parse/validate
  let data;
  try {
    data = BodySchema.parse(await req.json());
  } catch {
    return withStd(
      NextResponse.json(
        { success: false, error: "invalid_request", message: T.fill, request_id: requestId },
        { status: 400 },
      ),
    );
  }

  const email = data.email.trim().toLowerCase();
  const password = data.password;

  try {
    // 3) Kullanıcı bulunur
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      audit({ evt: "merchant.login.invalid_email", email: email.slice(0, 3) + "***", requestId });
      return withStd(
        NextResponse.json(
          { success: false, error: "invalid_credentials", message: T.invalid, request_id: requestId },
          { status: 401 },
        ),
      );
    }

    // 3b) User rate limit
    const userRl = await checkRateLimit({
      key: `merchant_login:user:${user.id}`,
      limit: RATE_LIMIT_COUNT,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!userRl.ok) {
      audit({ evt: "merchant.login.ratelimit.user", userId: user.id, requestId });
      return withStd(
        NextResponse.json(
          {
            success: false,
            error: "too_many_requests",
            message: T.ratelimit,
            request_id: requestId,
            retry_after: Math.ceil(userRl.resetMs / 1000),
          },
          { status: 429 },
        ),
      );
    }

    // 4) Kapılar
    if (user.role !== "merchant") {
      return withStd(
        NextResponse.json(
          { success: false, error: "forbidden", message: T.notMerchant, request_id: requestId },
          { status: 403 },
        ),
      );
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return withStd(
        NextResponse.json(
          { success: false, error: "locked", message: T.locked, request_id: requestId },
          { status: 403 },
        ),
      );
    }
    if (!user.passwordHash) {
      return withStd(
        NextResponse.json(
          { success: false, error: "invalid_credentials", message: T.invalid, request_id: requestId },
          { status: 401 },
        ),
      );
    }
    if (user.status !== "active") {
      return withStd(
        NextResponse.json(
          { success: false, error: "pending", message: T.pending, request_id: requestId },
          { status: 403 },
        ),
      );
    }

    // 5) Parola
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
      return withStd(
        NextResponse.json(
          { success: false, error: "invalid_credentials", message: T.invalid, request_id: requestId },
          { status: 401 },
        ),
      );
    }

    // Başarılı parola → sayaç sıfırla
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });

    // 6) NextAuth CSRF + cookie-jar
    const scheme = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host");
    const origin = process.env.NEXTAUTH_URL || `${scheme}://${host}`;

    let csrfToken, cookieJar, csrfSetCookie;
    try {
      ({ token: csrfToken, cookieJar, setCookieHeader: csrfSetCookie } = await getNextAuthCsrf(origin));
    } catch (e) {
      audit({ evt: "merchant.login.csrf_fetch_fail", userId: user.id, requestId, err: e?.message });
      return withStd(
        NextResponse.json(
          { success: false, error: "server_error", message: T.fail, request_id: requestId },
          { status: 500 },
        ),
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
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Cookie: cookieJar,
        Origin: origin,
        Referer: `${origin}/merchant`,
      },
      body: form.toString(),
      redirect: "manual",
    });

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
        evt: "merchant.login.callback_fail",
        userId: user.id,
        requestId,
        status: cbRes.status,
        err: cbJson?.error || "unknown",
      });
      return withStd(
        NextResponse.json(
          { success: false, error: "auth_failed", message: T.fail, request_id: requestId },
          { status: 401 },
        ),
      );
    }

    // 8) Session çerezlerini forward et
    const res = withStd(
      NextResponse.json({ success: true, message: T.success, request_id: requestId }, { status: 200 }),
    );
    for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    for (const c of splitSetCookies(csrfSetCookie)) res.headers.append("set-cookie", c);

    audit({ evt: "merchant.login.ok", userId: user.id, requestId });
    return res;
  } catch (e) {
    audit({ evt: "merchant.login.exception", requestId, err: e?.message });
    return withStd(
      NextResponse.json(
        { success: false, error: "server_error", message: MSG.en.fail, request_id: requestId },
        { status: 500 },
      ),
    );
  }
}
