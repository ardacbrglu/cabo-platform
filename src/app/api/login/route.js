// ✅ app/api/login/route.js
// Sorumluluk: Manuel login (Credentials Provider) için güvenli giriş
// Google login zaten /api/auth/[...nextauth] üzerinden çalışıyor.

export const dynamic = "force-dynamic";

import { csrf } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, logApiEvent } from "@/lib/ratelimit";
import { signIn } from "next-auth/react";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;   // 1 dakika
const RATE_LIMIT_COUNT     = 6;
const MAX_FAILED_ATTEMPTS  = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 dakika

const MESSAGES = {
  en: {
    fill:      "Please enter your email and password.",
    invalid:   "Incorrect email or password.",
    merchant:  "Merchants cannot log in here.",
    google:    "You signed up with Google. Please use Google login.",
    inactive:  "Your account has not been activated yet.",
    locked:    "Too many failed attempts. Please try again later.",
    success:   "Login successful!",
    fail:      "Login failed. Please try again.",
    ratelimit: "Too many requests. Please wait.",
    csrf:      "Invalid CSRF token."
  },
  tr: {
    fill:      "Lütfen e-posta ve şifrenizi girin.",
    invalid:   "E-posta veya şifre yanlış.",
    merchant:  "Satıcı hesapları buradan giriş yapamaz.",
    google:    "Google ile kayıt oldunuz. Lütfen Google ile giriş yapın.",
    inactive:  "Hesabınız henüz aktifleştirilmedi.",
    locked:    "Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.",
    success:   "Giriş başarılı!",
    fail:      "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen bekleyin.",
    csrf:      "Geçersiz CSRF anahtarı."
  }
};

function pickLocale(req) {
  const raw = req.headers.get("accept-language")?.split(",")[0] || "en";
  return raw.startsWith("tr") ? "tr" : "en";
}
function getClientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  return xf ? xf.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
}

export const POST = csrf(async (req) => {
  const locale = pickLocale(req);
  const msg = MESSAGES[locale];
  const ip = getClientIp(req);

  try {
    // Rate limit
    const allowed = await checkRateLimit(`login_ip_${ip}`, RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW_MS);
    if (!allowed) {
      await logApiEvent?.({ endpoint: "login", ip, event: "ratelimit" });
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // Parse input
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ success: false, message: msg.fill }, { status: 400 });
    }
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    if (!email || !password) {
      return Response.json({ success: false, message: msg.fill }, { status: 400 });
    }

    // Fetch user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await logApiEvent?.({ endpoint: "login", ip, event: "invalid_user" });
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    if (user.role === "merchant") {
      return Response.json({ success: false, message: msg.merchant }, { status: 403 });
    }
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return Response.json({ success: false, message: msg.locked }, { status: 403 });
    }
    if (!user.passwordHash) {
      return Response.json({ success: false, message: msg.google }, { status: 401 });
    }
    if (user.status !== "active") {
      return Response.json({ success: false, message: msg.inactive }, { status: 403 });
    }

    // Password check
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const nextFailed = (user.failedAttempts || 0) + 1;
      const willLock = nextFailed >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: nextFailed,
          lockUntil: willLock ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS) : user.lockUntil
        }
      });
      await logApiEvent?.({ endpoint: "login", ip, event: "bad_password", userId: user.id });
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    // Reset fail counter
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockUntil: null }
    });

    // NextAuth Credentials login
    const result = await signIn("credentials", {
      redirect: false,
      email,
      password
    });

    if (result?.error) {
      return Response.json({ success: false, message: msg.fail }, { status: 401 });
    }

    await logApiEvent?.({ endpoint: "login", ip, event: "success", userId: user.id });
    return Response.json({ success: true, message: msg.success }, { status: 200 });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    await logApiEvent?.({ endpoint: "login", ip, event: "server_error", detail: String(err?.message || err) });
    return Response.json({ success: false, message: msg.fail }, { status: 500 });
  }
});
