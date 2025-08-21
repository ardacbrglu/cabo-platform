export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/password_reset/request/route.js
 * Purpose: Şifre sıfırlama e-postası başlatma.
 * Security Docblock:
 * - POST: Origin/Referer eşleşmesi + X-Requested-With + X-Request-Id (ops. X-CSRF-Token kabul edilir).
 * - RateLimit: 5/dk (IP).
 * - Enumeration-safe: Kullanıcı yoksa da success döner.
 * - JSON error contract: { error, request_id, retry_after? }  (compat için message da döner)
 */

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

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const messages = {
  en: {
    required: "Email is required.",
    sent: "If user exists, password reset email sent.",
    ratelimit: "Too many requests. Please wait and try again.",
    fail: "Error sending password reset email.",
  },
  tr: {
    required: "E-posta gerekli.",
    sent: "Kullanıcı varsa şifre sıfırlama e-postası gönderildi.",
    ratelimit: "Çok fazla istek. Lütfen tekrar deneyin.",
    fail: "Şifre sıfırlama e-postası gönderilirken hata oluştu.",
  },
};

const BodySchema = z.object({
  email: z.string().email().max(254),
});

export async function POST(req) {
  const requestId = requireRequestId(req);
  requireOrigin(req);
  requireAjax(req);

  const locale = (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr") ? "tr" : "en";
  const t = (k) => messages[locale][k] ?? k;

  // Rate limit 5/dk
  const rl = await checkRateLimit({
    key: makeRateLimitKey(req, { scope: "pwreset_req" }),
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    audit({ evt: "pwreset.request.ratelimit", requestId });
    return withHeaders(
      NextResponse.json(
        {
          success: false,
          error: t("ratelimit"),
          message: t("ratelimit"),
          request_id: requestId,
          retry_after: Math.ceil(rl.resetMs / 1000),
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
      )
    );
  }

  // Body parse
  let data;
  try {
    const body = await req.json();
    data = BodySchema.parse(body);
  } catch {
    return withHeaders(
      NextResponse.json(
        { success: false, error: t("required"), message: t("required"), request_id: requestId },
        { status: 400 }
      )
    );
  }

  const email = data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Enumeration-safe: kullanıcı yoksa da success
  if (!user) {
    audit({ evt: "pwreset.request.ok.no_user", email: email.slice(0, 3) + "***", requestId });
    return withHeaders(
      NextResponse.json({ success: true, message: t("sent"), request_id: requestId })
    );
  }

  // Eski kullanılmamış tokenları temizle
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, used: false } });

  // 15 dk geçerli yeni token
  const token = uuidv4();
  const expiresAt = addMinutes(new Date(), 15);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt, used: false },
  });

  try {
    const lang = user.languagePreference || locale;
    await sendPasswordResetEmail(user.email, token, lang);
  } catch (e) {
    audit({ evt: "pwreset.request.mail_fail", userId: user.id, requestId, err: String(e && e.message || e) });
    // Yine enumeration-safe: dışa success
    return withHeaders(
      NextResponse.json({ success: true, message: t("sent"), request_id: requestId })
    );
  }

  audit({ evt: "pwreset.request.ok", userId: user.id, requestId });
  return withHeaders(
    NextResponse.json({ success: true, message: t("sent"), request_id: requestId })
  );
}
