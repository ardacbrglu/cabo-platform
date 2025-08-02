import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/ratelimit';
import axios from 'axios';

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

export const POST = csrf(async (req) => {
  try {
    // Locale
    const lang = req.headers.get("accept-language")?.split(',')[0] || "en";
    const locale = (lang && lang.startsWith("tr")) ? "tr" : "en";
    const msg = messages[locale];

    // Rate limit
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(`merchant_register_${ip}`, 5, 60 * 1000)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // Input
    const { name, email, password, phone_number, role, termsAccepted, captcha } = await req.json();

    // Terms check
    if (!termsAccepted) {
      return Response.json({ success: false, message: msg.terms }, { status: 400 });
    }
    if (!name || !email || !password || !phone_number || role !== "merchant") {
      return Response.json({ success: false, message: msg.required }, { status: 400 });
    }

    // --- CAPTCHA DOĞRULAMA ---
    if (!captcha) {
      return Response.json({ success: false, message: msg.captcha }, { status: 400 });
    }
    try {
      const captchaRes = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${captcha}`
      );
      if (!captchaRes.data.success) {
        return Response.json({ success: false, message: msg.captcha }, { status: 400 });
      }
    } catch (captchaError) {
      console.error('Captcha verification failed:', captchaError);
      return Response.json({ success: false, message: msg.captcha }, { status: 400 });
    }
    // ------------------------

    if (!emailRegex.test(email.trim().toLowerCase()))
      return Response.json({ success: false, message: msg.email }, { status: 400 });
    if (!nameRegex.test(name.trim()))
      return Response.json({ success: false, message: msg.username }, { status: 400 });
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password))
      return Response.json({ success: false, message: msg.password }, { status: 400 });
    if (!phoneRegex.test(phone_number.trim()))
      return Response.json({ success: false, message: msg.phone }, { status: 400 });

    // Duplicate check
    const existing = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), role: "merchant" }
    });
    if (existing)
      return Response.json({ success: false, message: msg.uniq }, { status: 409 });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password_hash: hashedPassword,
        phone_number: phone_number.trim(),
        role: "merchant",
        status: "pending",
        termsAccepted: !!termsAccepted
      }
    });

    // Log
    console.info(`[MERCHANT_REGISTER][${ip}] ${email.trim().toLowerCase()} (${name.trim()})`);

    return Response.json({
      success: true,
      message: msg.success
    }, { status: 200 });

  } catch (error) {
    console.error("Merchant Register Error:", error);
    const msg = messages.tr.fail;
    return Response.json({ success: false, message: msg }, { status: 500 });
  }
});
