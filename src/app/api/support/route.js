export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { verifyRecaptchaFromRequest } from "@/lib/captcha";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";
import { z } from "zod";

// ---- Config
const SUPPORT_RATE_LIMIT = { limit: Number(process.env.SUPPORT_RL_PER_MIN || "8"), windowMs: Number(process.env.SUPPORT_RL_WINDOW_MS || "60000") };
const SUPPORT_DAILY_CAP = Number(process.env.SUPPORT_DAILY_CAP || "20");

const schema = z.object({
  message: z.string().trim().min(1).max(900),
});

function withStd(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

function sanitizePlaintext(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/</g, "&lt;")
    .trim();
}

export async function POST(req) {
  // --- Preflight hardening (Origin + AJAX + Request-Id)
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
    requireOrigin(req);
    requireAjax(req);
  } catch {
    return withStd(NextResponse.json({ success: false, error: "bad_request", request_id: requestId }, { status: 400 }));
  }

  // Content-Type
  const ct = String(req.headers.get("content-type") || "");
  if (!ct.toLowerCase().includes("application/json")) {
    return withStd(NextResponse.json({ success: false, error: "unsupported_media_type", request_id: requestId }, { status: 415 }));
  }

  // Auth required
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    audit({ evt: "support.unauthorized", requestId });
    return withStd(NextResponse.json({ success: false, error: "unauthorized", request_id: requestId }, { status: 401 }));
  }

  // Rate limit (user-scoped; IP/UA ekli)
  const rlKey = makeRateLimitKey(req, { scope: "support_msg", userId });
  const { ok, resetMs } = await checkRateLimit({
    key: rlKey,
    limit: SUPPORT_RATE_LIMIT.limit,
    windowMs: SUPPORT_RATE_LIMIT.windowMs,
  });
  if (!ok) {
    const retry = Math.max(1, Math.ceil((resetMs || 0) / 1000));
    audit({ evt: "support.ratelimited", requestId, userId, retry });
    return withStd(
      NextResponse.json(
        { success: false, error: "too_many_requests", request_id: requestId, retry_after: retry },
        { status: 429, headers: { "Retry-After": String(retry) } },
      ),
    );
  }

  // Body + validate
  let body = {};
  try {
    body = await req.json();
  } catch {
    return withStd(NextResponse.json({ success: false, error: "invalid_json", request_id: requestId }, { status: 400 }));
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return withStd(NextResponse.json({ success: false, error: "invalid_payload", request_id: requestId }, { status: 400 }));
  }

  // reCAPTCHA (reads header x-recaptcha-token OR body.captcha; remote IP is taken from req)
  const tokenFromHeader = req.headers.get("x-recaptcha-token") || body?.captcha || null;
  const capOk = await verifyRecaptchaFromRequest(req, tokenFromHeader);
  if (!capOk) {
    audit({ evt: "support.captcha_fail", requestId, userId });
    return withStd(NextResponse.json({ success: false, error: "captcha_failed", request_id: requestId }, { status: 400 }));
  }

  // Daily cap
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dailyCount = await prisma.contactMessage.count({
    where: { userId: Number(userId), submittedAt: { gte: since } },
  });
  if (dailyCount >= SUPPORT_DAILY_CAP) {
    audit({ evt: "support.daily_cap", requestId, userId });
    return withStd(NextResponse.json({ success: false, error: "too_many_requests", request_id: requestId }, { status: 429 }));
  }

  // Persist
  const clean = sanitizePlaintext(parsed.data.message);
  if (!clean) {
    return withStd(NextResponse.json({ success: false, error: "invalid_payload", request_id: requestId }, { status: 400 }));
  }

  try {
    await prisma.contactMessage.create({
      data: {
        userId: Number(userId),
        message: clean,
      },
    });

    audit({ evt: "support.created", requestId, userId });
    return withStd(NextResponse.json({ success: true, request_id: requestId }, { status: 200 }));
  } catch (e) {
    audit({ evt: "support.db_error", requestId, userId, code: e?.code || "DB_ERR" });
    return withStd(NextResponse.json({ success: false, error: "server_error", request_id: requestId }, { status: 500 }));
  }
}
