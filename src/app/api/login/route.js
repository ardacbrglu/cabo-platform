export const dynamic = "force-dynamic";
import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_COUNT = 6;

const messages = {
  en: {
    fill: "Please enter your email and password.",
    invalid: "Incorrect email or password.",
    merchant: "Merchants cannot log in here.",
    google: "You signed up with Google. Please set a password to log in.",
    inactive: "Your account has not been activated yet.",
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
    success: "Giriş başarılı!",
    fail: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen bekleyin.",
    csrf: "Geçersiz CSRF anahtarı.",
  }
};

export const POST = csrf(async (req) => {
  try {
    // 1. Dil belirleme
    const lang = req.headers.get("accept-language")?.split(',')[0] || "en";
    const locale = lang.startsWith("tr") ? "tr" : "en";
    const msg = messages[locale];

    // 2. Rate limit
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(`login_${ip}`, RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // 3. Body verileri
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // 4. Kullanıcı bul
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    if (user.role === 'merchant') {
      return Response.json({ success: false, message: msg.merchant }, { status: 403 });
    }

    if (!user.passwordHash) {
      return Response.json({ success: false, message: msg.google }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    if (user.status !== 'active') {
      return Response.json({ success: false, message: msg.inactive }, { status: 403 });
    }

    // 5. JWT üret
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
      `cabo_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax;${process.env.NODE_ENV === 'production' ? ' Secure' : ''}`
    );

    return new Response(JSON.stringify({
      success: true,
      message: msg.success
    }), { status: 200, headers });

  } catch (err) {
    console.error("USER LOGIN ERROR:", err);
    const msg = messages.tr.fail;
    return Response.json({ success: false, message: msg }, { status: 500 });
  }
});
