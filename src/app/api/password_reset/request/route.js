// src/app/api/password_reset/request/route.js
/**
 * Security Docblock (Cabo PROD)
 * - Public endpoint (no session): password reset email request (enumeration-safe)
 * - Protections:
 *   - requireOrigin + requireAjax + requireRequestId
 *   - NextAuth CSRF (double-submit cookie): /api/auth/csrf -> x-csrf-token header
 *   - Rate limit: 5/min (IP+UA scope via lib/ratelimit)
 *   - Zod validation + sanitize
 *   - No-store responses + platform security headers
 *   - Audit logging (who/what/ip/ua/requestId/result)
 * - Error contract: { error, request_id, retry_after? }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { addMinutes } from "date-fns";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";
import { z } from "zod";

const messages = {
  en: {
    required: "Email is required.",
    sent: "If user exists, password reset email sent.",
    ratelimit: "Too many requests. Please wait and try again.",
  },
  tr: {
    required: "E-posta gerekli.",
    sent: "Kullanıcı varsa şifre sıfırlama e-postası gönderildi.",
    ratelimit: "Çok fazla istek. Lütfen tekrar deneyin.",
  },
};

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

function jsonError(status, error, requestId, extra = {}) {
  const body = { error, request_id: requestId, ...extra };
  return withHeaders(NextResponse.json(body, { status }));
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
  email: z.string().email().max(254),
});

export async function POST(req) {
  const requestId = requireRequestId(req);
  requireOrigin(req);
  requireAjax(req);

  // Content-Type check (perf + safety)
  const ct = String(req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    audit({ evt: "pwreset.request.unsupported_media", requestId });
    return jsonError(415, "Unsupported Media Type", requestId);
  }

  if (!verifyNextAuthCsrf(req)) {
    audit({ evt: "pwreset.request.csrf_fail", requestId });
    return jsonError(403, "Forbidden", requestId);
  }

  const locale = (req.headers.get("accept-language") || "")
    .toLowerCase()
    .startsWith("tr")
    ? "tr"
    : "en";
  const t = (k) => messages[locale]?.[k] ?? k;

  const rl = await checkRateLimit({
    key: makeRateLimitKey(req, { scope: "pwreset_req" }),
    limit: 5,
    windowMs: 60_000,
  });

  if (!rl.ok) {
    audit({ evt: "pwreset.request.ratelimit", requestId });
    const retryAfter = Math.ceil(rl.resetMs / 1000);
    return withHeaders(
      NextResponse.json(
        { error: t("ratelimit"), request_id: requestId, retry_after: retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    );
  }

  let data;
  try {
    data = BodySchema.parse(await req.json());
  } catch {
    audit({ evt: "pwreset.request.invalid_payload", requestId });
    return jsonError(400, t("required"), requestId);
  }

  const email = data.email.trim().toLowerCase();

  // Enumeration-safe: always "sent"
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, languagePreference: true, status: true, passwordHash: true },
    });

    if (!user || user.status !== "active") {
      audit({
        evt: "pwreset.request.ok.no_user_or_inactive",
        requestId,
        email: email.slice(0, 3) + "***",
      });
      return jsonOk({ success: true, message: t("sent") }, requestId);
    }

    // If user is Google-only (no password), block email reset (still enumeration-safe)
    const hasGoogle = await prisma.account.findFirst({
      where: { userId: user.id, provider: "google" },
      select: { id: true },
    });

    if (hasGoogle && !user.passwordHash) {
      audit({ evt: "pwreset.request.google_no_pw_blocked", userId: user.id, requestId });
      return jsonOk({ success: true, message: t("sent") }, requestId);
    }

    const token = uuidv4();
    const expiresAt = addMinutes(new Date(), 15);

    // Clean old unused + create new token atomically
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, used: false },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt, used: false },
      }),
    ]);

    const lang = user.languagePreference || locale;
    try {
      await sendPasswordResetEmail(user.email, token, lang);
      audit({ evt: "pwreset.request.ok", userId: user.id, requestId });
    } catch (e) {
      // enumeration-safe: still success
      audit({
        evt: "pwreset.request.mail_fail",
        userId: user.id,
        requestId,
        err: String(e?.message || e),
      });
    }

    return jsonOk({ success: true, message: t("sent") }, requestId);
  } catch (e) {
    // enumeration-safe: do not leak failures
    audit({ evt: "pwreset.request.server_error", requestId, err: String(e?.message || e) });
    return jsonOk({ success: true, message: t("sent") }, requestId);
  }
}
