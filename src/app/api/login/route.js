// src/app/api/login/route.js
import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY';
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_COUNT = 10;

const messages = {
  en: {
    fill: "Please fill in all fields.",
    invalid: "Email or password is incorrect.",
    merchant: "Merchants must log in from the Merchant Login page.",
    success: "Login successful!",
    fail: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait and try again.",
    csrf: "Invalid CSRF token."
  },
  tr: {
    fill: "Lütfen tüm alanları doldurun.",
    invalid: "E-posta veya şifre yanlış.",
    merchant: "Satıcılar Merchant Giriş ekranından giriş yapmalı.",
    success: "Giriş başarılı!",
    fail: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.",
    csrf: "Geçersiz CSRF anahtarı."
  }
};

export const POST = csrf(async (req) => {
  try {
    // Locale seçim
    const langHeader = req.headers.get('accept-language') || '';
    const locale = langHeader.startsWith('tr') ? 'tr' : 'en';
    const msg = messages[locale];

    // Rate limit kontrolü
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const ok = checkRateLimit(`login_${ip}`, RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW);
    if (!ok) {
      return new Response(JSON.stringify({ success: false, message: msg.ratelimit }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, message: msg.fill }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Kullanıcıyı bul & doğrula
    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: msg.invalid }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (user.role === 'merchant') {
      return new Response(JSON.stringify({ success: false, message: msg.merchant }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ success: false, message: msg.invalid }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // JWT oluştur ve cookie’ye yaz
    const payload = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append(
      'Set-Cookie',
      `cabo_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax;${process.env.NODE_ENV === 'production' ? ' Secure' : ''}`
    );

    return new Response(
      JSON.stringify({ success: true, message: msg.success }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    const msg = messages.tr.fail;
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
