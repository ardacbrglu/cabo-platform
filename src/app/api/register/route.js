/**
 * Affiliate register API (manual only)
 *
 * Security Docblock (Cabo PROD):
 * - requireOrigin + requireAjax + requireRequestId
 * - Ratelimit: 8/min (IP+UA)
 * - Validation: Zod + sanitize
 * - CAPTCHA: verify on all flows (with remote IP)
 * - Email activation: single-use token (1 day)
 * - JSON error contract: { success:false, error, message, request_id, [error_code] }
 * - Audit: success/error events with requestId
 * - DB: Prisma only (no raw SQL)
 * - NOTE: Google registration is DISABLED (returns 403)
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { sendActivationEmail } from "@/lib/mailer";
import { verifyRecaptchaFromRequest, verifyRecaptcha } from "@/lib/captcha";

export const runtime = "nodejs";

const ACTIVATION_JWT_SECRET = process.env.NEXTAUTH_SECRET;

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const ManualSchema = z.object({
  flow: z.literal("manual"),
  termsAccepted: z.literal(true),
  captcha: z.string().min(1),
  name: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/),
});

// 🚫 Google kaydı devre dışı. Payload gelse bile 403 vereceğiz.
const GoogleDisabledSchema = z.object({
  flow: z.literal("google"),
  termsAccepted: z.literal(true),
  captcha: z.string().min(1),
});

const messages = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    username: "Username must be 3–32 chars, only letters, numbers and _.",
    password: "Password must be at least 8 chars and include both letters and numbers.",
    uniq: "This email is already registered. If not activated, check your inbox.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    success: "Registration successful! Please check your email to activate your account.",
    googleReg: "This email is registered with Google. Please sign in with Google.",
    googleDisabled: "Google sign-in is temporarily disabled.",
    limitExceeded: "Activation email already sent 3 times today. Please try again tomorrow.",
    alreadyActive: "This email is already registered and activated. Try logging in or resetting your password.",
    mailfail: "Activation email could not be sent. Please try again later.",
    ok: "OK",
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    username: "Kullanıcı adı 3–32 karakter olmalı; yalnız harf/rakam/_.",
    password: "Şifre en az 8 karakter ve harf+rakam içermeli.",
    uniq: "Bu e-posta zaten kayıtlı. Aktivasyon tamamlanmadıysa e-postanı kontrol et.",
    terms: "Kullanım ve Gizlilik Şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız. Lütfen tekrar deneyin.",
    success: "Kayıt başarılı! Aktivasyon için e-postanı kontrol et.",
    googleReg: "Bu e-posta Google ile kayıtlı. Lütfen Google ile giriş yapın.",
    googleDisabled: "Google ile kayıt geçici olarak devre dışı.",
    limitExceeded: "Aktivasyon e-postası bugün 3 kez gönderildi. Yarın tekrar deneyin.",
    alreadyActive: "Bu e-posta zaten kayıtlı ve aktif. Giriş yapabilir veya şifreni sıfırlayabilirsin.",
    mailfail: "Aktivasyon e-postası gönderilemedi. Lütfen sonra tekrar deneyin.",
    ok: "Tamam",
  },
};

export async function POST(req) {
  // --- Preflight
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
    requireOrigin(req);
    requireAjax(req);
  } catch {
    return withHeaders(
      NextResponse.json(
        { success: false, error: "bad_request", message: "bad_request", request_id: requestId },
        { status: 400 }
      )
    );
  }

  const locale = (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr") ? "tr" : "en";
  const t = (k) => messages[locale][k] ?? k;

  // RL 8/dk (IP+UA)
  const rlKey = makeRateLimitKey(req, { scope: "register" });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 8, windowMs: 60_000 });
  if (!ok) {
    return withHeaders(
      NextResponse.json(
        {
          success: false,
          error: "too_many_requests",
          message: t("ratelimit"),
          request_id: requestId,
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
      )
    );
  }

  // Body parse
  let bodyRaw;
  try {
    bodyRaw = await req.json();
  } catch {
    return withHeaders(
      NextResponse.json(
        { success: false, error: "bad_request", message: t("required"), request_id: requestId },
        { status: 400 }
      )
    );
  }

  // ---- Google (DEVRE DIŞI)
  if (bodyRaw?.flow === "google") {
    try {
      GoogleDisabledSchema.parse(bodyRaw);
    } catch {}
    try {
      if (bodyRaw?.captcha) {
        // doğrula ama kayıt açma
        await verifyRecaptcha(bodyRaw.captcha).catch(() => ({}));
      }
    } catch {}
    audit({ evt: "register.google.disabled", requestId });
    return withHeaders(
      NextResponse.json(
        { success: false, error: "google_disabled", message: t("googleDisabled"), request_id: requestId },
        { status: 403 }
      )
    );
  }

  // ---- Manual
  let data;
  try {
    data = ManualSchema.parse(bodyRaw);
  } catch (e) {
    const field = e?.errors?.[0]?.path?.[0];
    const msg =
      field === "email"
        ? t("email")
        : field === "name"
        ? t("username")
        : field === "password"
        ? t("password")
        : t("required");
    return withHeaders(
      NextResponse.json(
        { success: false, error: "invalid_payload", message: msg, request_id: requestId },
        { status: 400 }
      )
    );
  }

  // ✅ CAPTCHA (IP ile)
  const capOk = await verifyRecaptchaFromRequest(req, data.captcha);
  if (!capOk) {
    return withHeaders(
      NextResponse.json(
        { success: false, error: "captcha_failed", message: t("captcha"), request_id: requestId },
        { status: 400 }
      )
    );
  }

  const email = data.email.trim().toLowerCase();
  const name = data.name.trim();

  // Google-only çakışma
  const googleAccount = await prisma.account.findFirst({
    where: { provider: "google", user: { email } },
  });
  if (googleAccount) {
    return withHeaders(
      NextResponse.json(
        { success: false, error: "google_only", message: t("googleReg"), request_id: requestId },
        { status: 409 }
      )
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status === "active") {
      return withHeaders(
        NextResponse.json(
          { success: false, error: "already_active", message: t("alreadyActive"), request_id: requestId },
          { status: 409 }
        )
      );
    }
    // pending → günlük 3 limit
    const now = new Date();
    const last = existing.lastActivationRequestAt || new Date(0);
    const isSameDay = now.toDateString() === last.toDateString();
    const count = isSameDay ? existing.activationRequestedCount || 0 : 0;
    if (count >= 3) {
      return withHeaders(
        NextResponse.json(
          { success: false, error: "limit_exceeded", message: t("limitExceeded"), request_id: requestId },
          { status: 429 }
        )
      );
    }

    const token = jwt.sign({ email }, ACTIVATION_JWT_SECRET, { expiresIn: "1d" });
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        activationToken: token,
        lastActivationRequestAt: now,
        activationRequestedCount: count + 1,
        termsAccepted: true,
        languagePreference: existing.languagePreference || locale,
      },
    });
    try {
      await sendActivationEmail(email, token, locale);
    } catch (err) {
      const code = err?.code || err?.kind || "mail_fail";
      audit({ evt: "register.manual.resend.mail_fail", email, requestId, code });
      return withHeaders(
        NextResponse.json(
          { success: false, error: "mail_fail", error_code: code, message: t("mailfail"), request_id: requestId },
          { status: 500 }
        )
      );
    }
    audit({ evt: "register.manual.resend", email, requestId });
    return withHeaders(
      NextResponse.json({ success: true, message: t("success"), request_id: requestId })
    );
  }

  // Yeni kullanıcı
  const passwordHash = await bcrypt.hash(data.password, 10);
  const activationToken = jwt.sign({ email }, ACTIVATION_JWT_SECRET, { expiresIn: "1d" });

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "affiliate",
      status: "pending",
      termsAccepted: true,
      activationToken,
      activationRequestedCount: 1,
      lastActivationRequestAt: new Date(),
      languagePreference: locale,
      currencyCode: "TRY",
    },
  });

  try {
    await sendActivationEmail(email, activationToken, locale);
  } catch (err) {
    const code = err?.code || err?.kind || "mail_fail";
    audit({ evt: "register.manual.create.mail_fail", email, requestId, code });
    return withHeaders(
      NextResponse.json(
        { success: false, error: "mail_fail", error_code: code, message: t("mailfail"), request_id: requestId },
        { status: 500 }
      )
    );
  }

  audit({ evt: "register.manual.created", email, requestId });
  return withHeaders(
    NextResponse.json({ success: true, message: t("success"), request_id: requestId })
  );
}
