export const dynamic = "force-dynamic";

import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not defined!");
}

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 dakika
const RATE_LIMIT_COUNT = 6;

const MAX_failedAttempts = 5;
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000; // 15 dakika

const messages = {
  en: {
    fill: "Please enter your email and password.",
    invalid: "Incorrect email or password.",
    merchant: "Merchants cannot log in here.",
    google: "You signed up with Google. Please set a password to log in.",
    inactive: "Your account has not been activated yet.",
    locked: "Too many failed attempts. Please try again later.",
    success: "Login successful!",
    fail: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait.",
    csrf: "Invalid CSRF token.",
  },
  tr: {
    fill: "Lütfen e-posta ve şifrenizi girin.",
    invalid: "E-posta veya şifre yanlış.",
    merchant: "Satıcı hesapları buradan giriş yapamaz.",
    google: "Google ile kayıt oldunuz. Giriş yapabilmek için şifre belirleyin.",
    inactive: "Hesabınız henüz aktifleştirilmedi.",
    locked: "Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.",
    success: "Giriş başarılı!",
    fail: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen bekleyin.",
    csrf: "Geçersiz CSRF anahtarı.",
  }
};

export const POST = csrf(async (req) => {
  try {
    const lang = req.headers.get("accept-language")?.split(',')[0] || "en";
    const locale = lang.startsWith("tr") ? "tr" : "en";
    const msg = messages[locale];

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(`login_${ip}`, RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ success: false, message: msg.fill }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    if (user.role === 'merchant') {
      return Response.json({ success: false, message: msg.merchant }, { status: 403 });
    }

    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return Response.json({ success: false, message: msg.locked }, { status: 403 });
    }

    // 🚫 Şifre belirlenmemiş Google kullanıcıları sadece Google login ile girebilir
    if (!user.passwordHash || user.passwordHash === "") {
      return Response.json({ success: false, message: msg.google }, { status: 401 });
    }

    if (user.status !== "active") {
      return Response.json({ success: false, message: msg.inactive }, { status: 403 });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: {
            increment: 1
          },
          lockUntil: user.failedAttempts + 1 >= MAX_failedAttempts
            ? new Date(Date.now() + ACCOUNT_LOCK_DURATION)
            : user.lockUntil
        }
      });
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    // Başarılı giriş
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockUntil: null
      }
    });

    const token = jwt.sign(
      {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    headers.append(
      "Set-Cookie",
      `cabo_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''}`
    );

    return new Response(JSON.stringify({
      success: true,
      message: msg.success
    }), { status: 200, headers });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    const locale = req.headers.get("accept-language")?.startsWith("tr") ? "tr" : "en";
    return Response.json({ success: false, message: messages[locale].fail }, { status: 500 });
  }
});
