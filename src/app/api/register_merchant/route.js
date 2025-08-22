export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Merchant registration (no Google). Creates user with role=merchant & status=pending.
 * Security: CSRF (wrapper), Origin/Referer + X-Requested-With + X-Request-Id, reCAPTCHA,
 *           IP rate-limit (5/min), strict Zod validation, secure headers, no-store.
 */

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { verifyRecaptchaFromRequest } from "@/lib/captcha";
import { audit } from "@/lib/logger";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const messages = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    name: "Name must be 3–40 chars (letters/numbers/space/_).",
    company: "Company name must be 2–150 chars and valid characters only.",
    password:
      "Password must be at least 8 chars and contain both letters and numbers.",
    phone: "Invalid phone number.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    uniq: "An account with this email already exists.",
    success:
      "Merchant registration successful. Your account is pending approval.",
    fail: "Registration failed. Please try again.",
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    name: "Ad Soyad 3–40 karakter olmalı (harf/rakam/boşluk/_).",
    company:
      "Şirket adı 2–150 karakter olmalı ve yalnızca geçerli karakterler içermeli.",
    password:
      "Şifre en az 8 karakter ve hem harf hem rakam içermelidir.",
    phone: "Geçersiz telefon numarası.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız. Lütfen tekrar deneyin.",
    uniq: "Bu e-posta ile bir hesap zaten var.",
    success: "Satıcı kaydı başarılı. Hesabınız onay bekliyor.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin.",
  },
};

const RegisterSchema = z
  .object({
    name: z.string().min(3).max(40).regex(/^[\p{L}\p{N}_ ]+$/u),
    companyName: z.string().min(2).max(150).regex(/^[\p{L}\p{N}\s&_.,'’()\-]+$/u),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "weak"),
    phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
    termsAccepted: z.literal(true),
  })
  .strict();

const normalize = (s) => s.replace(/\s+/g, " ").trim();
const pickLocale = (req) =>
  (req.headers.get("accept-language") || "")
    .toLowerCase()
    .startsWith("tr")
    ? "tr"
    : "en";

export const POST = withCsrfProtection(async (req) => {
  const locale = pickLocale(req);
  const msg = messages[locale];

  // Preflight hardening
  try {
    requireOrigin(req);
    requireAjax(req);
  } catch {
    return json({ success: false, message: msg.fail }, { status: 400 });
  }
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
  } catch {
    return json({ success: false, message: msg.fail }, { status: 400 });
  }

  // IP rate-limit 5/min
  const rlKey = makeRateLimitKey(req, { scope: "register_merchant" });
  const { ok, resetMs } = await checkRateLimit({
    key: rlKey,
    limit: 5,
    windowMs: 60_000,
  });
  if (!ok) {
    audit({ evt: "merchant.register.ratelimit", requestId });
    return json(
      { success: false, message: msg.ratelimit },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
    );
  }

  // Parse body
  let raw = null;
  try {
    raw = await req.json();
  } catch {
    return json({ success: false, message: msg.required }, { status: 400 });
  }

  // reCAPTCHA verify
  const capOk = await verifyRecaptchaFromRequest(req, raw?.captcha || null);
  if (!capOk) {
    audit({ evt: "merchant.register.captcha_fail", requestId });
    return json({ success: false, message: msg.captcha }, { status: 400 });
  }

  // Normalize + validate
  const data = {
    name: normalize(String(raw?.name ?? "")),
    companyName: normalize(String(raw?.companyName ?? "")),
    email: String(raw?.email ?? "").trim().toLowerCase(),
    password: String(raw?.password ?? ""),
    phoneNumber: String(raw?.phoneNumber ?? "").trim(),
    termsAccepted: !!raw?.termsAccepted,
  };

  const parsed = RegisterSchema.safeParse(data);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    const fieldMsg =
      field === "email"
        ? msg.email
        : field === "name"
        ? msg.name
        : field === "companyName"
        ? msg.company
        : field === "password"
        ? msg.password
        : field === "phoneNumber"
        ? msg.phone
        : field === "termsAccepted"
        ? msg.terms
        : msg.required;
    audit({ evt: "merchant.register.invalid", field, requestId });
    return json({ success: false, message: fieldMsg }, { status: 400 });
  }

  const { name, companyName, email, password, phoneNumber } = parsed.data;

  // Uniqueness
  const exists = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (exists) {
    audit({ evt: "merchant.register.conflict", requestId, email });
    return json({ success: false, message: msg.uniq }, { status: 409 });
  }

  // Create merchant (pending)
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
        status: "pending",
        emailVerified: new Date(),
        termsAccepted: true,
        languagePreference: locale,
      },
    });

    audit({ evt: "merchant.register.ok", requestId, email });
    return json({ success: true, message: msg.success }, { status: 200 });
  } catch (e) {
    audit({
      evt: "merchant.register.db_error",
      requestId,
      code: e?.code || "DB_ERR",
    });
    return json({ success: false, message: msg.fail }, { status: 500 });
  }
});
