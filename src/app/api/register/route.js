// app/api/register/route.js
// Sorumluluk: Kullanıcı kaydı
// - MANUEL: CSRF + RateLimit + reCAPTCHA + bcrypt + aktivasyon maili → status: "pending"
// - GOOGLE: CSRF + RateLimit + reCAPTCHA + terms → sadece "precheck" (imzalı, 5dk HttpOnly cookie)
//   Not: Oturumu NextAuth kurar. Yeni Google kullanıcısı oluşturulurken authOptions.signIn içinde
//   bu precheck cookie doğrulanırsa hesap "active" açılır ve otomatik login olur.
//
// Güvenlik Zinciri: auth(session yok) → CSRF → rate-limit → validation → işlem
// CSRF: withCsrfProtection header(cookie eşleşmesi) zorunlu
// RateLimit: IP bazlı (8/dk) → "Retry-After" header
// reCAPTCHA: server-side doğrulama (Google siteverify)

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { sendActivationEmail } from "@/lib/mailer";

const JWT_SECRET = process.env.JWT_SECRET;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined.");
if (!RECAPTCHA_SECRET_KEY) throw new Error("RECAPTCHA_SECRET_KEY is not defined.");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex = /^[a-zA-Z0-9_]{3,32}$/;

const messages = {
  en: {
    ratelimit: "Too many requests. Please wait and try again.",
    csrf: "Invalid CSRF token.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    username: "Username must be 3-32 chars, only letters, numbers and _. No spaces.",
    password: "Password must be at least 8 chars, include both letters and numbers.",
    uniq: "This email is already registered. If not activated, check your inbox.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    success: "Registration successful! Please check your email to activate your account.",
    fail: "Registration failed. Please try again.",
    googleReg: "This email is registered with Google. Please sign in with Google.",
    limitExceeded: "Activation email already sent 3 times today. Please try again tomorrow.",
    alreadyActive: "This email is already registered and activated. Try logging in or resetting your password.",
    mailfail: "Activation email could not be sent. Please try again later.",
    ok: "OK",
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf: "CSRF anahtarı geçersiz.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    username: "Kullanıcı adı 3-32 karakter olmalı, sadece harf/rakam/_ içerebilir.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermeli.",
    uniq: "Bu e-posta zaten kayıtlı. Aktivasyon tamamlanmadıysa, e-postanızı kontrol edin.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız oldu. Lütfen tekrar deneyin.",
    success: "Kayıt başarılı! Hesabınızı aktifleştirmek için e-postanızı kontrol edin.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin.",
    googleReg: "Bu e-posta Google ile kayıtlı. Lütfen Google ile giriş yapın.",
    limitExceeded: "Aktivasyon e-postası bugün 3 kez gönderildi. Lütfen yarın tekrar deneyin.",
    alreadyActive: "Bu e-posta zaten kayıtlı ve aktif. Giriş yapabilir veya şifrenizi sıfırlayabilirsiniz.",
    mailfail: "Aktivasyon e-postası gönderilemedi. Lütfen tekrar deneyin.",
    ok: "Tamam",
  },
};

// JSON helper: no-store
function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const POST = withCsrfProtection(async (req) => {
  const langHeader = req.headers.get("accept-language") || "";
  const locale = langHeader.toLowerCase().startsWith("tr") ? "tr" : "en";
  const msg = messages[locale];

  // Rate limit (IP bazlı 8/dk)
  const rlKey = makeRateLimitKey(req, { scope: "register" });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 8, windowMs: 60_000 });
  if (!ok) {
    return json(
      { success: false, message: msg.ratelimit },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
    );
  }

  // Body
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: msg.required }, { status: 400 });
  }

  // flow: "manual" | "google"
  const flow = (body?.flow || "manual").toString();
  const termsAccepted = Boolean(body?.termsAccepted);
  const captcha = (body?.captcha || "").toString();

  // 1) Terms zorunlu (her iki akış)
  if (!termsAccepted) {
    return json({ success: false, message: msg.terms }, { status: 400 });
  }

  // 2) reCAPTCHA (her iki akış)
  try {
    const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: RECAPTCHA_SECRET_KEY,
        response: captcha,
      }),
    });
    const captchaData = await verifyRes.json().catch(() => ({}));
    if (!captchaData?.success) {
      return json({ success: false, message: msg.captcha }, { status: 400 });
    }
  } catch {
    return json({ success: false, message: msg.captcha }, { status: 400 });
  }

  // 3) GOOGLE AKIŞI: precheck cookie (5 dk, imzalı)
  if (flow === "google") {
    const payload = { scope: "google_registration_precheck", iat: Math.floor(Date.now()/1000) };
    const cookieValue = jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });

    const res = json({ success: true, precheck: true, message: msg.ok }, { status: 200 });
    // SECURITY: HttpOnly + Strict + 5 dk
    res.cookies.set("google_reg_precheck", cookieValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      maxAge: 300,
      path: "/",
    });
    return res;
  }


  // 4) MANUEL AKIŞ
  const name = (body?.name || "").toString();
  const email = (body?.email || "").toString();
  const password = (body?.password || "").toString();

  if (!name || !email || !password) {
    return json({ success: false, message: msg.required }, { status: 400 });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim().replace(/[^a-zA-Z0-9_]/g, ""); // whitelist
  if (!emailRegex.test(cleanEmail)) {
    return json({ success: false, message: msg.email }, { status: 400 });
  }
  if (!nameRegex.test(cleanName)) {
    return json({ success: false, message: msg.username }, { status: 400 });
  }
  if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return json({ success: false, message: msg.password }, { status: 400 });
  }

  // Google hesapla çakışma → manuel engelle
  const googleAccount = await prisma.account.findFirst({
    where: { provider: "google", user: { email: cleanEmail } },
  });
  if (googleAccount) {
    return json({ success: false, message: msg.googleReg }, { status: 409 });
  }

  // Kullanıcı var mı?
  const existing = await prisma.user.findFirst({ where: { email: cleanEmail } });
  if (existing) {
    if (existing.status === "active") {
      return json({ success: false, message: msg.alreadyActive }, { status: 409 });
    }

    // pending → günde en fazla 3 mail
    const now = new Date();
    const lastSent = existing.lastActivationRequestAt || new Date(0);
    const isSameDay = now.toDateString() === lastSent.toDateString();
    const count = isSameDay ? existing.activationRequestedCount || 0 : 0;
    if (count >= 3) {
      return json({ success: false, message: msg.limitExceeded }, { status: 429 });
    }

    const newToken = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: "1d" });
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        activationToken: newToken,
        lastActivationRequestAt: now,
        activationRequestedCount: count + 1,
        termsAccepted: true,
      },
    });

    try {
      await sendActivationEmail(cleanEmail, newToken, locale);
    } catch {
      return json({ success: false, message: msg.mailfail }, { status: 500 });
    }
    return json({ success: true, message: msg.success }, { status: 200 });
  }

  // Yeni kullanıcı (manuel): pending + mail
  const passwordHash = await bcrypt.hash(password, 10);
  const activationToken = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: "1d" });

  await prisma.user.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role: "affiliate",
      status: "pending",
      termsAccepted: true,
      activationToken,
      activationRequestedCount: 1,
      lastActivationRequestAt: new Date(),
    },
  });

  try {
    await sendActivationEmail(cleanEmail, activationToken, locale);
  } catch {
    return json({ success: false, message: msg.mailfail }, { status: 500 });
  }

  return json({ success: true, message: msg.success }, { status: 200 });
});
