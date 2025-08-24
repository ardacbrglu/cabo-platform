// src/app/api/login/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Credentials Login Proxy (NextAuth callback) — Google login disabled
 *
 * Security Docblock (Cabo PROD):
 * - requireOrigin + requireAjax + requireRequestId
 * - Ratelimit: 5/min (IP+UA) + account lock after 5 failed attempts (15m)
 * - RBAC: merchants cannot log in here
 * - JSON-only I/O; no redirects (client handles navigation)
 * - Forwards Set-Cookie headers from NextAuth credentials callback
 * - Prisma only; audit all important events
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
    google: "Google sign-in is temporarily disabled.",
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
    google: "Google ile giriş geçici olarak devre dışı.",
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

// çoklu Set-Cookie parse
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

function getOrigin(req) {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  const scheme = xfProto || "https";
  const host = xfHost || req.headers.get("host");
  return `${scheme}://${host}`;
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

  // rate-limit 5/dk
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

  // body doğrulama
  let body;
  try {
    body = LoginSchema.parse(await req.json());
  } catch {
    return withHeaders(
      NextResponse.json(
        { success: false, message: msg.fill, request_id: requestId },
        { status: 400 }
      )
    );
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  try {
    // kullanıcı kapıları
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
        NextResponse.json(
          { success: false, message: msg.invalid, request_id: requestId },
          { status: 401 }
        )
      );

    if (!user) return generic();
    if (user.role === "merchant")
      return withHeaders(
        NextResponse.json(
          { success: false, message: msg.merchant, request_id: requestId },
          { status: 403 }
        )
      );
    if (user.lockUntil && user.lockUntil > new Date())
      return withHeaders(
        NextResponse.json(
          { success: false, message: msg.locked, request_id: requestId },
          { status: 403 }
        )
      );

    // Google-only hesaplar login edilemez (Google kapalı)
    const isGoogleOnly =
      !user.passwordHash && user.accounts?.some?.((a) => a.provider === "google");
    if (isGoogleOnly)
      return withHeaders(
        NextResponse.json(
          { success: false, message: msg.google, request_id: requestId },
          { status: 403 }
        )
      );

    if (user.status !== "active")
      return withHeaders(
        NextResponse.json(
          { success: false, message: msg.inactive, request_id: requestId },
          { status: 403 }
        )
      );

    // parola kontrolü + lock sayaç
    const match = user.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
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

    // sayaç sıfırla
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockUntil: null },
    });

    // NextAuth CSRF + credentials callback (server-side)
    const origin = getOrigin(req);

    let csrfToken, cookieJar, csrfSetCookie;
    try {
      ({ token: csrfToken, cookieJar, csrfSetCookie } = await getNextAuthCsrf(origin));
    } catch (e) {
      audit({
        evt: "login.csrf_fetch_error",
        userId: user.id,
        reason: e?.message,
        requestId,
      });
      return debugHeader(
        withHeaders(
          NextResponse.json(
            { success: false, message: msg.fail, request_id: requestId },
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
          referer: `${origin}/login`,
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
        evt: "login.callback_fail",
        userId: user.id,
        status: cbRes.status,
        err: cbJson?.error,
        requestId,
      });
      return debugHeader(
        withHeaders(
          NextResponse.json(
            { success: false, message: msg.fail, request_id: requestId },
            { status: 401 }
          )
        ),
        `cb_fail:${cbRes.status}:${cbJson?.error || "unknown"}`
      );
    }

    // session çerezlerini forward et (CSRF çerezleri dahil)
    const res = debugHeader(
      withHeaders(
        NextResponse.json(
          { success: true, message: msg.success, request_id: requestId },
          { status: 200 }
        )
      ),
      okJson ? "ok:json" : "ok:302_session"
    );
    for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    for (const c of splitSetCookies(csrfSetCookie)) res.headers.append("set-cookie", c);

    audit({ evt: "login.ok", userId: user.id, requestId });
    return res;
  } catch (e) {
    audit({ evt: "login.server_error", error: String(e?.message || e), requestId });
    return withHeaders(
      NextResponse.json(
        { success: false, message: msg.fail, request_id: requestId },
        { status: 503 }
      )
    );
  }
}
