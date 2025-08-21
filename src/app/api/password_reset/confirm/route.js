export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/password_reset/confirm/route.js
 * Purpose: Şifre sıfırlama token’ı ile yeni parola belirleme.
 * Security Docblock:
 * - POST: Origin/Referer + X-Requested-With + X-Request-Id (ops. X-CSRF-Token kabul).
 * - RateLimit: 5/dk (IP).
 * - Transaction: user update + token kullanım işareti + diğer token temizlik.
 * - JSON error contract: { error, request_id, retry_after? }  (compat için message da döner)
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const messages = {
  en: {
    invalid: "Token invalid or expired.",
    required: "Missing token or password.",
    weak: "Password must be at least 8 chars, with letters and numbers.",
    user: "User not found.",
    used: "This reset link has already been used.",
    success: "Password successfully changed.",
    ratelimit: "Too many requests. Please wait and try again.",
  },
  tr: {
    invalid: "Token geçersiz veya süresi dolmuş.",
    required: "Eksik bilgi.",
    weak: "Şifre en az 8 karakter, harf ve rakam içermeli.",
    user: "Kullanıcı bulunamadı.",
    used: "Bu sıfırlama linki zaten kullanılmış.",
    success: "Şifre başarıyla değiştirildi.",
    ratelimit: "Çok fazla istek. Lütfen tekrar deneyin.",
  },
};

const BodySchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/) // en az bir harf
    .regex(/\d/),      // en az bir rakam
});

export async function POST(req) {
  const requestId = requireRequestId(req);
  requireOrigin(req);
  requireAjax(req);

  const locale = (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr") ? "tr" : "en";
  const t = (k) => messages[locale][k] ?? k;

  // Rate limit 5/dk
  const rl = await checkRateLimit({
    key: makeRateLimitKey(req, { scope: "pwreset_confirm" }),
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    audit({ evt: "pwreset.confirm.ratelimit", requestId });
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

  // Token kaydı
  const record = await prisma.passwordResetToken.findUnique({ where: { token: data.token } });
  if (!record) {
    return withHeaders(
      NextResponse.json(
        { success: false, error: t("invalid"), message: t("invalid"), request_id: requestId },
        { status: 400 }
      )
    );
  }
  if (record.used) {
    return withHeaders(
      NextResponse.json(
        { success: false, error: t("used"), message: t("used"), request_id: requestId },
        { status: 400 }
      )
    );
  }
  if (record.expiresAt < new Date()) {
    return withHeaders(
      NextResponse.json(
        { success: false, error: t("invalid"), message: t("invalid"), request_id: requestId },
        { status: 400 }
      )
    );
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) {
    return withHeaders(
      NextResponse.json(
        { success: false, error: t("user"), message: t("user"), request_id: requestId },
        { status: 404 }
      )
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        failedAttempts: 0,
        lockUntil: null,
        // passwordUpdatedAt: new Date(), // şemanızda varsa açın
      },
    });
    await tx.passwordResetToken.update({ where: { token: record.token }, data: { used: true } });
    await tx.passwordResetToken.deleteMany({
      where: { userId: user.id, used: false, token: { not: record.token } },
    });
  });

  audit({ evt: "pwreset.confirm.ok", userId: user.id, requestId });
  return withHeaders(
    NextResponse.json({ success: true, message: t("success"), request_id: requestId })
  );
}
