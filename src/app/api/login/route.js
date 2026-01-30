// src/app/api/login/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Credentials Login Proxy (NextAuth callback) — Google login disabled
 *
 * Security Docblock (Cabo PROD):
 * - Origin/Referer checks (same-origin)
 * - Request-Id enforced (generated if missing)
 * - Rate-limit (via your lib) + account lock logic
 * - RBAC + status gates
 * - JSON-only I/O; client handles navigation
 * - Forwards Set-Cookie headers from NextAuth credentials callback
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

// If these exist in your project, keep them.
// If any of these paths differ in your repo, tell me the exact filenames and I’ll align them.
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
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

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.toLowerCase().startsWith("tr") ? "tr" : "en";
}

function withHeaders(res, requestId) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  if (requestId) res.headers.set("x-request-id", requestId);
  return applyApiSecurityHeaders(res);
}

function debugHeader(res, reason) {
  if (DEBUG && reason) res.headers.set("x-debug-reason", reason);
  return res;
}

function mkRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function splitSetCookies(headerVal) {
  // robust split for multiple set-cookie in a single header string
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

function isProd() {
  return process.env.NODE_ENV === "production";
}

function requireSameOrigin(req, origin) {
  // In production we enforce strict same-origin. In dev, keep tolerant to avoid local proxy issues.
  if (!isProd()) return;

  const reqOrigin = req.headers.get("origin");
  const reqReferer = req.headers.get("referer");

  // allow missing origin for some same-site contexts, but referer should exist for browser POSTs
  const okOrigin = !reqOrigin || reqOrigin === origin;
  const okReferer = !reqReferer || reqReferer.startsWith(origin);

  if (!okOrigin || !okReferer) {
    const err = new Error("origin_mismatch");
    err.code = "origin_mismatch";
    throw err;
  }
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

export async function POST(req) {
  const requestId = req.headers.get("x-request-id") || mkRequestId();
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];

  const origin = getOrigin(req);

  try {
    requireSameOrigin(req, origin);
  } catch (e) {
    audit?.({ evt: "login.origin_block", requestId, reason: e?.code || e?.message });
    return withHeaders(
      NextResponse.json(
        { success: false, message: msg.fail, request_id: requestId },
        { status: 403 }
      ),
      requestId
    );
  }

  // rate-limit 5/min
  try {
    const rlKey = makeRateLimitKey(req, { scope: "login" });
    const rl = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    if (!rl.ok) {
      const res = NextResponse.json(
        { success: false, message: msg.ratelimit, request_id: requestId },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
      );
      audit?.({ evt: "login.ratelimit", requestId });
      return withHeaders(res, requestId);
    }
  } catch (e) {
    // If rate-limit infra fails, do not hard-fail login; keep safe generic behavior.
    audit?.({ evt: "login.ratelimit_error", requestId, reason: String(e?.message || e) });
  }

  // body validate
  let body;
  try {
    body = LoginSchema.parse(await req.json());
  } catch {
    return withHeaders(
      NextResponse.json({ success: false, message: msg.fill, request_id: requestId }, { status: 400 }),
      requestId
    );
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  try {
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
        accounts: { select: { provider: true }, take: 5 },
      },
    });

    const generic401 = () =>
      withHeaders(
        NextResponse.json({ success: false, message: msg.invalid, request_id: requestId }, { status: 401 }),
        requestId
      );

    if (!user) return generic401();

    if (user.role === "merchant") {
      return withHeaders(
        NextResponse.json({ success: false, message: msg.merchant, request_id: requestId }, { status: 403 }),
        requestId
      );
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      return withHeaders(
        NextResponse.json({ success: false, message: msg.locked, request_id: requestId }, { status: 403 }),
        requestId
      );
    }

    // Google-only accounts cannot use credentials here (and Google login is disabled)
    const hasGoogle = Array.isArray(user.accounts) && user.accounts.some((a) => a.provider === "google");
    const isGoogleOnly = !user.passwordHash && hasGoogle;
    if (isGoogleOnly) {
      return withHeaders(
        NextResponse.json({ success: false, message: msg.google, request_id: requestId }, { status: 403 }),
        requestId
      );
    }

    if (user.status !== "active") {
      return withHeaders(
        NextResponse.json({ success: false, message: msg.inactive, request_id: requestId }, { status: 403 }),
        requestId
      );
    }

    const match = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!match) {
      const nextFailed = (user.failedAttempts || 0) + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: nextFailed,
          lockUntil: nextFailed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS) : user.lockUntil,
        },
      });
      audit?.({ evt: "login.fail", userId: user.id, attempts: nextFailed, requestId });
      return generic401();
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockUntil: null },
    });

    // NextAuth CSRF + credentials callback
    let csrfToken, cookieJar, csrfSetCookie;
    try {
      ({ token: csrfToken, cookieJar, csrfSetCookie } = await getNextAuthCsrf(origin));
    } catch (e) {
      audit?.({ evt: "login.csrf_fetch_error", userId: user.id, reason: e?.message, requestId });
      return debugHeader(
        withHeaders(
          NextResponse.json({ success: false, message: msg.fail, request_id: requestId }, { status: 500 }),
          requestId
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

    const cbRes = await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`, {
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
    });

    const setCookieHeader = cbRes.headers.get("set-cookie") || "";
    let cbJson = {};
    try {
      cbJson = await cbRes.json();
    } catch {}

    const okJson = cbRes.ok && !cbJson?.error;
    const okRedirectWithSession = (cbRes.status === 302 || cbRes.status === 303) && containsSessionCookie(setCookieHeader);

    if (!okJson && !okRedirectWithSession) {
      audit?.({ evt: "login.callback_fail", userId: user.id, status: cbRes.status, err: cbJson?.error, requestId });
      return debugHeader(
        withHeaders(
          NextResponse.json({ success: false, message: msg.fail, request_id: requestId }, { status: 401 }),
          requestId
        ),
        `cb_fail:${cbRes.status}:${cbJson?.error || "unknown"}`
      );
    }

    const res = debugHeader(
      withHeaders(
        NextResponse.json({ success: true, message: msg.success, request_id: requestId }, { status: 200 }),
        requestId
      ),
      okJson ? "ok:json" : "ok:302_session"
    );

    // forward cookies (session + csrf cookies)
    for (const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie", c);
    for (const c of splitSetCookies(csrfSetCookie)) res.headers.append("set-cookie", c);

    audit?.({ evt: "login.ok", userId: user.id, requestId });
    return res;
  } catch (e) {
    audit?.({ evt: "login.server_error", error: String(e?.message || e), requestId });
    return withHeaders(
      NextResponse.json({ success: false, message: msg.fail, request_id: requestId }, { status: 503 }),
      requestId
    );
  }
}
