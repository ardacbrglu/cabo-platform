import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_COUNT = 8; // Dilerseniz azaltın

const messages = {
  en: {
    fill: "Please enter your email and password.",
    invalid: "Incorrect email or password.",
    pending: "Your merchant account is pending approval.",
    rejected: "Your merchant application was rejected.",
    notMerchant: "Access denied. Not a merchant account.",
    notActive: "Merchant account is not active.",
    success: "Login successful!",
    fail: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait.",
    csrf: "Invalid CSRF token.",
  },
  tr: {
    fill: "Lütfen e-posta ve şifrenizi girin.",
    invalid: "E-posta veya şifre yanlış.",
    pending: "Satıcı hesabınız onay bekliyor.",
    rejected: "Satıcı başvurunuz reddedildi.",
    notMerchant: "Bu giriş sadece satıcılar içindir.",
    notActive: "Satıcı hesabınız aktif değil.",
    success: "Giriş başarılı!",
    fail: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen bekleyin.",
    csrf: "Geçersiz CSRF anahtarı.",
  }
};

export const POST = csrf(async (req) => {
  try {
    // 1. Locale tespiti
    const lang = req.headers.get("accept-language")?.split(',')[0] || "en";
    const locale = (lang && lang.startsWith("tr")) ? "tr" : "en";
    const msg = messages[locale];

    // 2. Rate limit
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(`merchant_login_${ip}`, RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // 3. Body parse
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // 4. User lookup
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    if (user.role !== 'merchant') {
      return Response.json({ success: false, message: msg.notMerchant }, { status: 403 });
    }

    // 5. Şifre kontrol
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    // 6. Hesap durumu
    if (user.status === 'pending') {
      return Response.json({ success: false, status: 'pending', message: msg.pending }, { status: 403 });
    }
    if (user.status === 'rejected') {
      return Response.json({ success: false, status: 'rejected', message: msg.rejected }, { status: 403 });
    }
    if (user.status !== 'active') {
      return Response.json({ success: false, message: msg.notActive }, { status: 403 });
    }

    // 7. Başarılı login, JWT üret
    const payload = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // 8. Cookie setle
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `cabo_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax;${process.env.NODE_ENV === 'production' ? ' Secure;' : ''}`
    );

    return new Response(JSON.stringify({
      success: true,
      message: msg.success
    }), {
      status: 200,
      headers
    });

    // ➡️ İLERİDE: "Google ile giriş" veya "Şifre sıfırlama" gibi endpoint’ler de buraya eklenir (ayrı dosya/endpoint).
  } catch (err) {
    console.error("MERCHANT LOGIN ERROR:", err);
    const msg = messages.tr.fail;
    return Response.json({ success: false, message: msg }, { status: 500 });
  }
});
