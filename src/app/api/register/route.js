import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';
import axios from 'axios';

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PROD_!@#_Cabo";
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nameRegex  = /^[a-zA-Z0-9_]{3,32}$/;

const messages = {
  en: {
    ratelimit: "Too many requests. Please try again later.",
    csrf:     "Invalid CSRF token.",
    terms:    "You must accept terms and privacy policy.",
    required: "Please fill in all fields.",
    email:    "Invalid email address.",
    username: "Username must be 3-32 chars, only letters, numbers, and _.",
    password: "Password must be at least 8 chars and contain both letters and numbers.",
    uniq:     "Username or email already in use.",
    captcha:  "Captcha verification failed. Please try again.",
    success:  "Registration successful! Please check your email to activate your account.",
    fail:     "Registration failed. Please try again."
  },
  tr: {
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf:      "CSRF tokenı geçersiz.",
    terms:     "Kullanım ve gizlilik şartlarını kabul etmelisin.",
    required:  "Lütfen tüm alanları doldurun.",
    email:     "Geçersiz e-posta adresi.",
    username:  "Kullanıcı adı 3-32 karakter, sadece harf, rakam ve _ içermeli.",
    password:  "Şifre en az 8 karakter ve harf/rakam içermeli.",
    uniq:      "Kullanıcı adı veya e-posta zaten kullanılıyor.",
    captcha:   "Doğrulama başarısız oldu. Lütfen tekrar deneyin.",
    success:   "Kayıt başarılı! Hesabını aktifleştirmek için e-postanı kontrol et.",
    fail:      "Kayıt başarısız. Lütfen tekrar deneyin."
  }
};

export const POST = csrf(async (req) => {
  try {
    // Locale seçimi
    const langHeader = req.headers.get('accept-language') || '';
    const locale    = langHeader.startsWith('tr') ? 'tr' : 'en';
    const msg       = messages[locale];

    // Rate limit kontrolü
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(`register_${ip}`, 8, 60 * 1000)) {
      return new Response(JSON.stringify({ success: false, message: msg.ratelimit }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Body’den captcha da alınacak
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

    // --- CAPTCHA DOĞRULAMA ---
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
    // -----------------------

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

    // Benzersiz isim/email kontrolü
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { name:  cleanName },
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

    // Şifre hash & kullanıcı oluştur
    const hashed = await bcrypt.hash(password, 10);
    const user   = await prisma.user.create({
      data: {
        name,
        email:           cleanEmail,
        password_hash:   hashed,
        role:            'affiliate',
        status:          'pending',
        termsAccepted:   true
      }
    });

    // JWT oluştur
    const payload = {
      user_id: user.user_id,
      name:    user.name,
      email:   user.email,
      role:    user.role
    };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Cookie header’ı ayarla
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append(
      'Set-Cookie',
      `cabo_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax;${process.env.NODE_ENV === 'production' ? ' Secure' : ''}`
    );

    // Başarılı yanıt
    return new Response(JSON.stringify({ success: true, message: msg.success }), {
      status: 200,
      headers
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
