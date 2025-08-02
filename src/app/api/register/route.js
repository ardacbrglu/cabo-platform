import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';
import axios from 'axios';
// Nodemailer kurulmalı: npm i nodemailer
import nodemailer from 'nodemailer';

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PROD_!@#_Cabo";
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex = /^[a-zA-Z0-9_]{3,32}$/;

const messages = {
  en: {
    ratelimit: "Too many requests. Please try again later.",
    csrf: "Invalid CSRF token.",
    terms: "You must accept terms and privacy policy.",
    required: "Please fill in all fields.",
    email: "Invalid email address.",
    username: "Username must be 3-32 chars, only letters, numbers, and _.",
    password: "Password must be at least 8 chars and contain both letters and numbers.",
    uniq: "Username or email already in use.",
    captcha: "Captcha verification failed. Please try again.",
    success: "Registration successful! Please check your email to activate your account.",
    fail: "Registration failed. Please try again."
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf: "CSRF tokenı geçersiz.",
    terms: "Kullanım ve gizlilik şartlarını kabul etmelisin.",
    required: "Lütfen tüm alanları doldurun.",
    email: "Geçersiz e-posta adresi.",
    username: "Kullanıcı adı 3-32 karakter, sadece harf, rakam ve _ içermeli.",
    password: "Şifre en az 8 karakter ve harf/rakam içermeli.",
    uniq: "Kullanıcı adı veya e-posta zaten kullanılıyor.",
    captcha: "Doğrulama başarısız oldu. Lütfen tekrar deneyin.",
    success: "Kayıt başarılı! Hesabını aktifleştirmek için e-postanı kontrol et.",
    fail: "Kayıt başarısız. Lütfen tekrar deneyin."
  }
};

export const POST = csrf(async (req) => {
  try {
    // Locale seçimi
    const langHeader = req.headers.get('accept-language') || '';
    const locale = langHeader.startsWith('tr') ? 'tr' : 'en';
    const msg = messages[locale];

    // Rate limit kontrolü
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(`register_${ip}`, 8, 60 * 1000)) {
      return new Response(JSON.stringify({ success: false, message: msg.ratelimit }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Input
    const { name, email, password, termsAccepted, captcha } = await req.json();

    if (!termsAccepted) {
      return new Response(JSON.stringify({ success: false, message: msg.terms }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!name || !email || !password) {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // CAPTCHA DOĞRULAMA
    if (!captcha) {
      return new Response(JSON.stringify({ success: false, message: msg.captcha }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    try {
      const captchaRes = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${captcha}`
      );
      if (!captchaRes.data.success) {
        return new Response(JSON.stringify({ success: false, message: msg.captcha }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (captchaError) {
      console.error('Captcha verification failed:', captchaError);
      return new Response(JSON.stringify({ success: false, message: msg.captcha }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!emailRegex.test(cleanEmail)) {
      return new Response(JSON.stringify({ success: false, message: msg.email }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const cleanName = name.trim();
    if (!nameRegex.test(cleanName)) {
      return new Response(JSON.stringify({ success: false, message: msg.username }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return new Response(JSON.stringify({ success: false, message: msg.password }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Uniq kontrol
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { name: cleanName },
          { email: cleanEmail }
        ]
      }
    });
    if (existing) {
      return new Response(JSON.stringify({ success: false, message: msg.uniq }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash & create
    const hashed = await bcrypt.hash(password, 10);

    // Kullanıcı status: 'pending', activationToken üret
    const activationToken = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: '1d' });
    await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        password_hash: hashed,
        role: 'affiliate',
        status: 'pending',
        termsAccepted: true,
        activation_token: activationToken // user tablosunda bu alan olmalı!
      }
    });

    // Aktivasyon maili gönder (nodemailer ile)
    // .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS olmalı
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Cabo" <no-reply@cabo.com>',
      to: cleanEmail,
      subject: locale === "tr" ? "Cabo Hesap Aktivasyonu" : "Cabo Account Activation",
      html: `
        <p>${locale === "tr"
          ? "Cabo hesabını aktifleştirmek için aşağıdaki linke tıkla:"
          : "Click below to activate your Cabo account:"}</p>
        <p>
          <a href="${process.env.NEXT_PUBLIC_BASE_URL}/activate?token=${activationToken}">
            ${locale === "tr" ? "Hesabımı Aktifleştir" : "Activate My Account"}
          </a>
        </p>
        <br>
        <p>${locale === "tr"
          ? "Link 24 saat geçerlidir."
          : "This link is valid for 24 hours."}</p>
      `
    };
    await transporter.sendMail(mailOptions);

    // JWT ve Cookie setleme yapılmaz (aktifleşmeden giriş olmasın)
    return new Response(JSON.stringify({ success: true, message: msg.success }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('REGISTER ERROR:', err);
    const msg = messages.tr.fail;
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
