// src/app/api/password_reset/confirm/route.js
/**
 * Security Docblock (Cabo PROD)
 * - Public endpoint (no session): password reset confirm (set new password)
 * - Protections:
 *   - requireOrigin + requireAjax + requireRequestId
 *   - NextAuth CSRF (double-submit cookie)
 *   - Rate limit: 10/min (IP+UA) + optional token-scope limiter after parse
 *   - Zod validation + sanitize; password length bounded for bcrypt safety
 *   - Transactional update + audit log
 *   - No-store responses + platform security headers
 * - Error contract: { error, request_id, retry_after? }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

function jsonError(status, error, requestId, extra = {}) {
  return withHeaders(NextResponse.json({ error, request_id: requestId, ...extra }, { status }));
}

function jsonOk(payload, requestId, status = 200) {
  return withHeaders(NextResponse.json({ ...payload, request_id: requestId }, { status }));
}

// NextAuth CSRF (double-submit cookie)
function readCookie(req, name) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function verifyNextAuthCsrf(req) {
  const header = req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
  if (!header) return false;

  const cookie =
    readCookie(req, "__Host-next-auth.csrf-token") ||
    readCookie(req, "__Secure-next-auth.csrf-token") ||
    readCookie(req, "next-auth.csrf-token");

  if (!cookie) return false;
  const [cookieToken] = String(cookie).split("|");
  return !!cookieToken && String(header) === String(cookieToken);
}

const BodySchema = z.object({
  token: z.string().min(10).max(256),
  // bcrypt input safety: cap length (72 is common limit for bcrypt input)
  password: z.string().min(8).max(72),
});

export async function POST(req) {
  const requestId = requireRequestId(req);
  requireOrigin(req);
  requireAjax(req);

  const ct = String(req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    audit({ evt: "pwreset.confirm.unsupported_media", requestId });
    return jsonError(415, "Unsupported Media Type", requestId);
  }

  // IP/UA rate limit (mutations: 10/min)
  const rlKey = makeRateLimitKey(req, { scope: "pwreset_confirm" });
  const rl = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    const retryAfter = Math.ceil(rl.resetMs / 1000);
    audit({ evt: "pwreset.confirm.ratelimit", requestId, retryAfter });
    return withHeaders(
      NextResponse.json(
        { error: "Too many attempts", request_id: requestId, retry_after: retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    );
  }

  if (!verifyNextAuthCsrf(req)) {
    audit({ evt: "pwreset.confirm.csrf_fail", requestId });
    return jsonError(403, "Forbidden", requestId);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    audit({ evt: "pwreset.confirm.invalid_payload", requestId });
    return jsonError(400, "Invalid payload", requestId);
  }

  const token = String(parsed.data.token).trim();
  const password = String(parsed.data.password);

  // Optional: token-scoped rate limiter (cheap brute-force dampener)
  const rlToken = await checkRateLimit({
    key: `pwreset_confirm:token:${token.slice(0, 16)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rlToken.ok) {
    const retryAfter = Math.ceil(rlToken.resetMs / 1000);
    audit({ evt: "pwreset.confirm.token_ratelimit", requestId, retryAfter });
    return withHeaders(
      NextResponse.json(
        { error: "Too many attempts", request_id: requestId, retry_after: retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    );
  }

  try {
    const rec = await prisma.passwordResetToken.findUnique({
      where: { token },
      select: { id: true, userId: true, used: true, expiresAt: true },
    });

    if (!rec || rec.used || (rec.expiresAt && rec.expiresAt < new Date())) {
      audit({ evt: "pwreset.confirm.invalid_or_expired", requestId });
      return jsonError(400, "Invalid or expired token", requestId);
    }

    // Ensure user is still active (optional but consistent)
    const user = await prisma.user.findUnique({
      where: { id: rec.userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== "active") {
      audit({ evt: "pwreset.confirm.user_inactive", requestId, userId: rec.userId });
      return jsonError(400, "Invalid or expired token", requestId);
    }

    const hash = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: rec.userId },
        data: { passwordHash: hash },
      });

      await tx.passwordResetToken.update({
        where: { id: rec.id },
        data: { used: true },
      });

      // Hygiene: invalidate any other outstanding tokens
      await tx.passwordResetToken.updateMany({
        where: { userId: rec.userId, used: false },
        data: { used: true },
      });
    });

    audit({ evt: "pwreset.confirm.ok", requestId, userId: rec.userId });
    return jsonOk({ success: true }, requestId);
  } catch (err) {
    audit({ evt: "pwreset.confirm.server_error", requestId, err: String(err?.message || err) });
    return jsonError(500, "Server error", requestId);
  }
}
