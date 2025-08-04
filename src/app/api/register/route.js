export const dynamic = "force-dynamic";
import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';
import axios from 'axios';
import { sendActivationEmail } from '@/lib/mailer';

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PROD_!@#_Cabo";
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

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
    uniq: "This email is already registered.",
    terms: "You must accept the Terms and Privacy Policy.",
    captcha: "Captcha verification failed. Please try again.",
    success: "Registration successful! Please check your email to activate your account.",
    fail: "Registration failed. Please try again.",
    googleReg: "This email is registered with Google. Please sign in with Google.",
  },
  tr: {
    ratelimit: "\u00c7ok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf: "CSRF anahtarı geçersiz.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    username: "Kullanıcı adı 3-32 karakter olmali, sadece harf/rakam/_ içerebilir. Boşluk yok.",
    password: "Şifre en az 8 karakter ve hem harf hem rakam içermeli.",
    uniq: "Bu e-posta zaten kayıtlı.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisiniz.",
    captcha: "Doğrulama başarısız oldu. Lütfen tekrar deneyin.",
    success: "Kayıt başarılı! Hesabınızı aktifleştirmek için e-posta kutunuzu kontrol edin.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin.",
    googleReg: "Bu e-posta Google ile kayıtlı. Lütfen Google ile giriş yapın.",
  }
};

export const POST = csrf(async (req) => {
  try {
    const langHeader = req.headers.get('accept-language') || '';
    const locale = langHeader.startsWith('tr') ? 'tr' : 'en';
    const msg = messages[locale];

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(`register_${ip}`, 8, 60 * 1000)) {
      return new Response(JSON.stringify({ success: false, message: msg.ratelimit }), { status: 429 });
    }

    const { name, email, password, termsAccepted, captcha } = await req.json();

    if (!termsAccepted || !name || !email || !password || !captcha) {
      return new Response(JSON.stringify({ success: false, message: msg.required }), { status: 400 });
    }

    const { data: captchaData } = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${captcha}`
    );
    if (!captchaData.success) {
      return new Response(JSON.stringify({ success: false, message: msg.captcha }), { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!emailRegex.test(cleanEmail)) return new Response(JSON.stringify({ success: false, message: msg.email }), { status: 400 });
    if (!nameRegex.test(cleanName)) return new Response(JSON.stringify({ success: false, message: msg.username }), { status: 400 });
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return new Response(JSON.stringify({ success: false, message: msg.password }), { status: 400 });
    }

    const googleAccount = await prisma.account.findFirst({ where: { provider: 'google', user: { email: cleanEmail } } });
    if (googleAccount) return new Response(JSON.stringify({ success: false, message: msg.googleReg }), { status: 409 });

    const existing = await prisma.user.findFirst({ where: { email: cleanEmail } });
    if (existing) return new Response(JSON.stringify({ success: false, message: msg.uniq }), { status: 409 });

    const hashed = await bcrypt.hash(password, 10);
    const activationToken = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: '1d' });

    await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        passwordHash: hashed,
        role: 'affiliate',
        status: 'pending',
        termsAccepted: true,
        activationToken
      }
    });

 

    try {
      await sendActivationEmail(cleanEmail, activationToken);
    } catch (emailErr) {
      console.error("EMAIL SEND ERROR:", emailErr);
      return new Response(JSON.stringify({ success: false, message: "Activation email could not be sent." }), {
        status: 500
      });
    }

    return new Response(JSON.stringify({ success: true, message: msg.success }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('REGISTER ERROR:', err);
    return new Response(JSON.stringify({ success: false, message: messages.tr.fail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
