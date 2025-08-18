// app/api/register_merchant/route.js
export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * SECURITY NOTES
 * - CSRF: withCsrfProtection wrapper kullanılıyor.
 * - Rate limit: IP bazlı 5/dk (register_merchant scope).
 * - Captcha: Google reCAPTCHA siteverify (header/body'den kabul).
 * - Validation: Zod (strict), trim/normalize, whitelist.
 * - Role: client’tan rol alınmaz; server "merchant" yazar.
 * - Status: yeni merchant "pending" (admin onayı gerekir).
 * - Headers: Duyarlı endpoint → Cache-Control: no-store.
 */

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

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
    name: z
      .string()
      .min(3)
      .max(40)
      // Unicode harfler (TR dahil) + rakam + boşluk + altçizgi
      .regex(/^[\p{L}\p{N}_ ]+$/u),
    companyName: z
      .string()
      .min(2)
      .max(150)
      // Firma adlarında yaygın: harf/rakam/boşluk/_ . , & ' ( ) - karakterleri
      .regex(/^[\p{L}\p{N}\s&_.,'’()\-]+$/u),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "weak"),
    phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
    termsAccepted: z.literal(true),
  })
  .strict();

function localeFrom(req) {
  const lang = req.headers.get("accept-language")?.split(",")[0] || "en";
  return lang && lang.toLowerCase().startsWith("tr") ? "tr" : "en";
}

function normalizeSpaces(s) {
  return s.replace(/\s+/g, " ").trim();
}

async function verifyRecaptcha(req, token) {
  if (!token || !RECAPTCHA_SECRET_KEY) return false;
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;

    const params = new URLSearchParams();
    params.set("secret", RECAPTCHA_SECRET_KEY);
    params.set("response", token);
    if (ip) params.set("remoteip", ip);

    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = await res.json().catch(() => ({}));
    return !!json?.success;
  } catch {
    return false;
  }
}

export const POST = withCsrfProtection(async (req) => {
  const locale = localeFrom(req);
  const msg = messages[locale];

  // Rate limit (IP bazlı 5/dk)
  const rlKey = makeRateLimitKey(req, { scope: "register_merchant" });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
  if (!ok) {
    return new NextResponse(JSON.stringify({ success: false, message: msg.ratelimit }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((resetMs || 0) / 1000)),
        "Cache-Control": "no-store",
      },
    });
  }

  // Body parse
  let raw;
  try {
    raw = await req.json();
  } catch {
    return new NextResponse(JSON.stringify({ success: false, message: msg.required }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // Captcha token: header veya body.captcha
  const captchaToken =
    req.headers.get("x-recaptcha-token") ||
    req.headers.get("x-recaptcha") ||
    raw?.captcha ||
    null;
  const captchaOk = await verifyRecaptcha(req, captchaToken);
  if (!captchaOk) {
    return new NextResponse(JSON.stringify({ success: false, message: msg.captcha }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
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
      field === "email"
        ? msg.email
        : field === "name"
        ? msg.username
        : field === "companyName"
        ? msg.company
        : field === "password"
        ? msg.password
        : field === "phoneNumber"
        ? msg.phone
        : field === "termsAccepted"
        ? msg.terms
        : msg.required;

    return new NextResponse(JSON.stringify({ success: false, message: fieldMsg }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const { name, companyName, email, password, phoneNumber } = parsed.data;

  // Email tekilliği
  const existing = await prisma.user.findUnique({
    where: { email }, // email UNIQUE
    select: { id: true },
  });
  if (existing) {
    return new NextResponse(JSON.stringify({ success: false, message: msg.uniq }), {
      status: 409,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // Hash
  const passwordHash = await bcrypt.hash(password, 10);

  // Oluştur (role=merchant, status=pending)
  try {
    await prisma.user.create({
      data: {
        name, // gösterim adı
        realUserFullname: name, // ad-soyad kayıt
        companyName, // ⬅️ yeni alan (schema'da String?)
        email,
        passwordHash,
        phoneNumber,
        role: "merchant",
        status: "pending", // admin aktif etmeden login yok
        emailVerified: new Date(),
        termsAccepted: true,
        languagePreference: locale, // "tr" veya "en"
        // currencyCode: default TRY DB'den geliyor
      },
    });
  } catch (e) {
    // UNIQUE veya başka DB hatası durumunda genel yanıt
    return new NextResponse(JSON.stringify({ success: false, message: msg.fail }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(JSON.stringify({ success: true, message: msg.success }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
