/**
 * Affiliate register:
 * - flow=manual  → kullanıcı oluştur + aktivasyon e-postası (token 1g).
 * - flow=google  → precheck (terms+captcha), 10 dk imzalı cookie → NextAuth Google.
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
import { verifyRecaptcha } from "@/lib/captcha";

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

const GooglePrecheckSchema = z.object({
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

  const locale = (req.headers.get("accept-language") || "")
    .toLowerCase()
    .startsWith("tr")
    ? "tr"
    : "en";
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

  // ---- Google precheck
  if (bodyRaw?.flow === "google") {
    let data;
    try {
      data = GooglePrecheckSchema.parse(bodyRaw);
    } catch {
      return withHeaders(
        NextResponse.json(
          { success: false, error: "invalid_payload", message: t("required"), request_id: requestId },
          { status: 400 }
        )
      );
    }

    const cap = await verifyRecaptcha(data.captcha);
    if (!cap.ok) {
      return withHeaders(
        NextResponse.json(
          { success: false, error: "captcha_failed", message: t("captcha"), request_id: requestId },
          { status: 400 }
        )
      );
    }

    // 10 dk imzalı precheck cookie
    const preToken = jwt.sign(
      { scope: "google_registration_precheck" },
      process.env.NEXTAUTH_SECRET,
      { expiresIn: "10m" }
    );
    const res = NextResponse.json({
      success: true,
      precheck: true,
      message: t("ok"),
      request_id: requestId,
    });
    res.cookies.set("google_reg_precheck", preToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    audit({ evt: "register.google.precheck.ok", requestId });
    return withHeaders(res);
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

  const cap = await verifyRecaptcha(data.captcha);
  if (!cap.ok) {
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
        // dil & para birimini istersen Accept-Language'a göre güncelleyebilirsin:
        languagePreference: existing.languagePreference || locale,
      },
    });
    try {
      await sendActivationEmail(email, token, locale);
    } catch {
      return withHeaders(
        NextResponse.json(
          { success: false, error: "mail_fail", message: t("mailfail"), request_id: requestId },
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
      languagePreference: locale, // ilk dil tercihi
      currencyCode: "TRY",
    },
  });

  try {
    await sendActivationEmail(email, activationToken, locale);
  } catch {
    return withHeaders(
      NextResponse.json(
        { success: false, error: "mail_fail", message: t("mailfail"), request_id: requestId },
        { status: 500 }
      )
    );
  }

  audit({ evt: "register.manual.created", email, requestId });
  return withHeaders(
    NextResponse.json({ success: true, message: t("success"), request_id: requestId })
  );
}
