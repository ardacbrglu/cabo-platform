export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { NextResponse } from "next/server";
import { z } from "zod";

// ✅ yeni: güvenlik & log yardımcıları
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";
// ✅ ortak captcha doğrulama
import { verifyRecaptchaFromRequest } from "@/lib/captcha";

/**
 * SECURITY NOTES
 * - CSRF: withCsrfProtection wrapper.
 * - Origin/Referer eşleşmesi, X-Requested-With ve X-Request-Id zorunlu.
 * - Rate limit: IP bazlı 5/dk (register_merchant scope).
 * - Captcha: Google reCAPTCHA siteverify (lib/captcha).
 * - Validation: Zod (strict), trim/normalize, whitelist.
 * - Role: client’tan rol alınmaz; server "merchant" yazar.
 * - Status: yeni merchant "pending" (admin onayı gerekir).
 * - Yanıt başlıkları: applyApiSecurityHeaders + Cache-Control: no-store.
 */

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

// i18n mesajları
const messages = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    csrf: "Invalid CSRF token.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    username: "Name must be 3–40 chars, letters/numbers/space/_ only.",
    company: "Company name must be 2–150 chars and valid characters only.",
    password: "Password must be at least 8 chars and contain both letters and numbers.",
    phone: "Invalid phone number.",
    uniq: "An account with this email already exists.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    success: "Merchant registration successful. Your account is pending approval.",
    fail: "Registration failed. Please try again.",
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf: "CSRF anahtarı geçersiz.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    username: "Ad Soyad 3–40 karakter olmalı; harf/rakam/boşluk/_ içerebilir.",
    company: "Şirket adı 2–150 karakter olmalı ve geçerli karakterler kullanılmalı.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermelidir.",
    phone: "Geçersiz telefon numarası.",
    uniq: "Bu e-posta ile bir hesap zaten var.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız oldu. Lütfen tekrar deneyin.",
    success: "Satıcı kaydı başarılı. Hesabınız onay bekliyor.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin.",
  },
};

// Zod şeması (merchant register)
const RegisterSchema = z
  .object({
    name: z.string().min(3).max(40).regex(/^[\p{L}\p{N}_ ]+$/u),
    companyName: z.string().min(2).max(150).regex(/^[\p{L}\p{N}\s&_.,'’()\-]+$/u),
    email: z.string().email(),
    password: z.string().min(8).refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "weak"),
    phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
    termsAccepted: z.literal(true),
  })
  .strict();

function localeFrom(req) {
  const lang = req.headers.get("accept-language")?.split(",")[0] || "en";
  return lang.toLowerCase().startsWith("tr") ? "tr" : "en";
}
const normalizeSpaces = (s) => s.replace(/\s+/g, " ").trim();

export const POST = withCsrfProtection(async (req) => {
  const locale = localeFrom(req);
  const msg = messages[locale];

  // ✅ köken & ajax & request-id zorunlu
  try {
    requireOrigin(req);
    requireAjax(req);
  } catch (e) {
    audit({ type: "merchant_register", stage: "preflight", ok: false, code: e.code || "PRECHECK", status: e.status || 400 });
    return json({ success: false, message: msg.fail }, { status: e.status || 400 });
  }
  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
  } catch (e) {
    audit({ type: "merchant_register", stage: "preflight", ok: false, code: e.code || "NO_REQ_ID", status: e.status || 400 });
    return json({ success: false, message: msg.fail }, { status: e.status || 400 });
  }

  // Rate limit (IP bazlı 5/dk)
  const rlKey = makeRateLimitKey(req, { scope: "register_merchant" });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
  if (!ok) {
    audit({ type: "merchant_register", stage: "ratelimit", ok: false, requestId });
    return json(
      { success: false, message: msg.ratelimit },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
    );
  }

  // Body parse
  let raw;
  try {
    raw = await req.json();
  } catch {
    audit({ type: "merchant_register", stage: "parse", ok: false, requestId });
    return json({ success: false, message: msg.required }, { status: 400 });
  }

  // ✅ captcha (ortak lib)
  const captchaOk = await verifyRecaptchaFromRequest(req, raw?.captcha || null);
  if (!captchaOk) {
    audit({ type: "merchant_register", stage: "captcha", ok: false, requestId });
    return json({ success: false, message: msg.captcha }, { status: 400 });
  }

  // Clean + Validate
  const data = {
    name: normalizeSpaces(String(raw?.name ?? "")),
    companyName: normalizeSpaces(String(raw?.companyName ?? "")),
    email: String(raw?.email ?? "").trim().toLowerCase(),
    password: String(raw?.password ?? ""),
    phoneNumber: String(raw?.phoneNumber ?? "").trim(),
    termsAccepted: !!raw?.termsAccepted,
  };

  const parsed = RegisterSchema.safeParse(data);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    const fieldMsg =
      field === "email" ? msg.email :
      field === "name" ? msg.username :
      field === "companyName" ? msg.company :
      field === "password" ? msg.password :
      field === "phoneNumber" ? msg.phone :
      field === "termsAccepted" ? msg.terms : msg.required;

    audit({ type: "merchant_register", stage: "validate", ok: false, field, requestId });
    return json({ success: false, message: fieldMsg }, { status: 400 });
  }

  const { name, companyName, email, password, phoneNumber } = parsed.data;

  // Email tekilliği
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    audit({ type: "merchant_register", stage: "conflict", ok: false, requestId });
    return json({ success: false, message: msg.uniq }, { status: 409 });
  }

  // Hash
  const passwordHash = await bcrypt.hash(password, 10);

  // Oluştur (role=merchant, status=pending)
  try {
    await prisma.user.create({
      data: {
        name,
        realUserFullname: name,
        companyName,
        email,
        passwordHash,
        phoneNumber,
        role: "merchant",
        status: "pending", // admin aktif etmeden login yok
        emailVerified: new Date(),
        termsAccepted: true,
        languagePreference: locale,
      },
    });

    audit({ type: "merchant_register", stage: "created", ok: true, requestId });
    return json({ success: true, message: msg.success }, { status: 200 });
  } catch (e) {
    audit({ type: "merchant_register", stage: "db_error", ok: false, requestId, code: e?.code || "DB_ERR" });
    return json({ success: false, message: msg.fail }, { status: 500 });
  }
});
