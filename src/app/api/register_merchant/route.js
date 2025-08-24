/**
 * File: src/app/api/register_merchant/route.js
 * Purpose: Merchant registration (no Google). Creates user with role=merchant & status=pending.
 *
 * Security Docblock (Cabo PROD):
 * - Preflight: Origin/Referer host eşleşmesi, X-Requested-With (AJAX), zorunlu X-Request-Id.
 * - Rate limit: IP 5/dk (key: auth:register_merchant:ip:{ip}) → 429 {error, request_id, retry_after}.
 * - Validation: Zod (+ normalize), reCAPTCHA verify (server-side).
 * - Headers: security defaults + Cache-Control:no-store (+ Retry-After gerektiğinde).
 * - Errors: JSON sözleşmesi {success:false, error?, message, request_id}.
 * - DB: Prisma; raw SQL yok.
 */

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { verifyRecaptchaFromRequest } from "@/lib/captcha";
import { audit } from "@/lib/logger";
import { sanitize } from "@/lib/validation";

const ONE_MINUTE = 60;
const RATE_LIMIT_PER_MIN = 5;

const MSG = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    name: "Name must be 3–40 chars (letters/numbers/space/_).",
    company: "Company name must be 2–150 chars and valid characters only.",
    password: "Password must be at least 8 chars and contain both letters and numbers.",
    phone: "Invalid phone number.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    uniq: "An account with this email already exists.",
    success: "Merchant registration successful. Your account is pending approval.",
    fail: "Registration failed. Please try again.",
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    name: "Ad Soyad 3–40 karakter olmalı (harf/rakam/boşluk/_).",
    company: "Şirket adı 2–150 karakter olmalı ve yalnızca geçerli karakterler içermeli.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermelidir.",
    phone: "Geçersiz telefon numarası.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız. Lütfen tekrar deneyin.",
    uniq: "Bu e-posta ile bir hesap zaten var.",
    success: "Satıcı kaydı başarılı. Hesabınız onay bekliyor.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin.",
  },
};

function t(req) {
  const raw = (req.headers.get("accept-language") || "").split(",")[0] || "en";
  const locale = raw.toLowerCase().startsWith("tr") ? "tr" : "en";
  return MSG[locale];
}

function ipOf(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || "0.0.0.0";
}

function withStd(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const RegisterSchema = z.object({
  name: z.string().min(3).max(40).regex(/^[\p{L}\p{N}_ ]+$/u),
  companyName: z.string().min(2).max(150).regex(/^[\p{L}\p{N}\s&_.,'’()\-]+$/u),
  email: z.string().email(),
  password: z.string().min(8).refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "weak"),
  phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
  termsAccepted: z.literal(true),
}).strict();

const normalize = (s) => s.replace(/\s+/g, " ").trim();

export async function POST(req) {
  // ---- Preflight
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
    requireOrigin(req);
    requireAjax(req);
  } catch {
    return withStd(NextResponse.json(
      { success: false, error: "bad_request", message: MSG.en.fail, request_id: requestId },
      { status: 400 },
    ));
  }

  const M = t(req);

  // ---- Rate-limit (IP 5/min)
  {
    const key = `auth:register_merchant:ip:${ipOf(req)}`;
    const { allowed, retryAfterSec } = await checkRateLimit(key, RATE_LIMIT_PER_MIN, ONE_MINUTE);
    if (!allowed) {
      audit({ evt: "merchant.register.ratelimit", requestId });
      return withStd(NextResponse.json(
        {
          success: false,
          error: "too_many_requests",
          message: M.ratelimit,
          request_id: requestId,
          retry_after: retryAfterSec || ONE_MINUTE,
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSec || ONE_MINUTE) } },
      ));
    }
  }

  // ---- Body parse
  let raw = null;
  try {
    raw = await req.json();
  } catch {
    return withStd(NextResponse.json(
      { success: false, error: "invalid_request", message: M.required, request_id: requestId },
      { status: 400 },
    ));
  }

  // ---- reCAPTCHA verify
  const capOk = await verifyRecaptchaFromRequest(req, raw?.captcha || null);
  if (!capOk) {
    audit({ evt: "merchant.register.captcha_fail", requestId });
    return withStd(NextResponse.json(
      { success: false, error: "captcha_failed", message: M.captcha, request_id: requestId },
      { status: 400 },
    ));
  }

  // ---- Normalize + validate + sanitize
  const data = {
    name: sanitize.text(normalize(String(raw?.name ?? ""))),
    companyName: sanitize.text(normalize(String(raw?.companyName ?? ""))),
    email: String(raw?.email ?? "").trim().toLowerCase(),
    password: String(raw?.password ?? ""),
    phoneNumber: String(raw?.phoneNumber ?? "").trim(),
    termsAccepted: !!raw?.termsAccepted,
  };

  const parsed = RegisterSchema.safeParse(data);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    const fieldMsg =
      field === "email" ? M.email :
      field === "name" ? M.name :
      field === "companyName" ? M.company :
      field === "password" ? M.password :
      field === "phoneNumber" ? M.phone :
      field === "termsAccepted" ? M.terms :
      M.required;
    audit({ evt: "merchant.register.invalid", field, requestId });
    return withStd(NextResponse.json(
      { success: false, error: "invalid_payload", message: fieldMsg, request_id: requestId },
      { status: 400 },
    ));
  }

  const { name, companyName, email, password, phoneNumber } = parsed.data;

  // ---- Uniqueness
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) {
    audit({ evt: "merchant.register.conflict", requestId });
    return withStd(NextResponse.json(
      { success: false, error: "conflict", message: M.uniq, request_id: requestId },
      { status: 409 },
    ));
  }

  // ---- Create merchant (pending)
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name,
        realUserFullname: name,
        companyName,
        email,
        passwordHash,
        phoneNumber,
        role: "merchant",
        status: "pending", // aktivasyon ya da admin onayı akışına kadar beklet
        emailVerified: new Date(),
        termsAccepted: true,
        languagePreference: (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr") ? "tr" : "en",
      },
    });

    audit({ evt: "merchant.register.ok", requestId });
    return withStd(NextResponse.json(
      { success: true, message: M.success, request_id: requestId },
      { status: 200 },
    ));
  } catch (e) {
    audit({ evt: "merchant.register.db_error", requestId, code: e?.code || "DB_ERR" });
    return withStd(NextResponse.json(
      { success: false, error: "server_error", message: M.fail, request_id: requestId },
      { status: 500 },
    ));
  }
}
