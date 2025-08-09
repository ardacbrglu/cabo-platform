// app/api/register_merchant/route.js
export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex = /^[a-zA-Z0-9_ ]{3,40}$/;
const phoneRegex = /^\+?\d{10,15}$/;

const messages = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    csrf: "Invalid CSRF token.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    username: "Name must be 3-40 chars, only letters, numbers, spaces, and _.",
    password: "Password must be at least 8 chars and contain both letters and numbers.",
    phone: "Invalid phone number.",
    uniq: "A merchant account with this email already exists.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    success: "Merchant registration successful. Your account is pending approval.",
    fail: "Registration failed. Please try again."
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf: "CSRF anahtarı geçersiz.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    username: "İsim 3-40 karakter, harf/rakam/boşluk/_ içerebilir.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermeli.",
    phone: "Geçersiz telefon numarası.",
    uniq: "Bu e-posta ile daha önce satıcı kaydı yapılmış.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız oldu. Lütfen tekrar deneyin.",
    success: "Satıcı kaydınız başarılı. Hesabınız onay bekliyor.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin."
  }
};

export const POST = withCsrfProtection(async (req) => {
  // Locale
  const lang = req.headers.get("accept-language")?.split(",")[0] || "en";
  const locale = lang && lang.startsWith("tr") ? "tr" : "en";
  const msg = messages[locale];

  // Rate limit (IP bazlı 5/dk)
  const rlKey = makeRateLimitKey(req, { scope: "register_merchant" });
  const { ok } = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
  if (!ok) {
    return new Response(JSON.stringify({ success: false, message: msg.ratelimit }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Body
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: msg.required }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    name,
    email,
    password,
    phoneNumber,
    // role,  // güvenlik: rolü client'tan almayacağız
    termsAccepted,
    captcha, // reCAPTCHA token
  } = body || {};

  // Terms kontrolü
  if (!termsAccepted) {
    return new Response(JSON.stringify({ success: false, message: msg.terms }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Zorunlu alanlar
  if (!name || !email || !password || !phoneNumber) {
    return new Response(JSON.stringify({ success: false, message: msg.required }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // CAPTCHA doğrulama
  if (!captcha || !RECAPTCHA_SECRET_KEY) {
    return new Response(JSON.stringify({ success: false, message: msg.captcha }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        `secret=${encodeURIComponent(RECAPTCHA_SECRET_KEY)}` +
        `&response=${encodeURIComponent(captcha)}`,
    });
    const captchaRes = await res.json();
    if (!captchaRes?.success) {
      return new Response(JSON.stringify({ success: false, message: msg.captcha }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ success: false, message: msg.captcha }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validation
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = String(name).trim();
  const cleanPhone = String(phoneNumber).trim();
  const pw = String(password);

  if (!emailRegex.test(cleanEmail)) {
    return new Response(JSON.stringify({ success: false, message: msg.email }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!nameRegex.test(cleanName)) {
    return new Response(JSON.stringify({ success: false, message: msg.username }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (pw.length < 8 || !/\d/.test(pw) || !/[a-zA-Z]/.test(pw)) {
    return new Response(JSON.stringify({ success: false, message: msg.password }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!phoneRegex.test(cleanPhone)) {
    return new Response(JSON.stringify({ success: false, message: msg.phone }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Duplicate (aynı email ile zaten merchant var mı?)
  const existing = await prisma.user.findFirst({
    where: { email: cleanEmail, role: "merchant" },
    select: { id: true },
  });
  if (existing) {
    return new Response(JSON.stringify({ success: false, message: msg.uniq }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Hash
  const passwordHash = await bcrypt.hash(pw, 10);

  // Create (rolü server zorlar: "merchant")
  await prisma.user.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      phoneNumber: cleanPhone,
      role: "merchant",
      status: "pending",
      termsAccepted: !!termsAccepted,
    },
  });

  return new Response(JSON.stringify({ success: true, message: msg.success }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
