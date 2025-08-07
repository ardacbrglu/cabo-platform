// SORUMLULUK: Token ve yeni şifre ile şifreyi sıfırlar. Token bir kere kullanılır ve süresi kontrol edilir.
// Rate limit, brute-force, CSRF korumalı.

export const dynamic = "force-dynamic";

import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/ratelimit';

const messages = {
  en: {
    invalid: "Token invalid or expired.",
    required: "Missing token or password.",
    weak: "Password must be at least 8 chars, with letters and numbers.",
    user: "User not found.",
    used: "This reset link has already been used.",
    success: "Password successfully changed.",
    fail: "Failed to reset password.",
    ratelimit: "Too many requests. Please wait and try again.",
  },
  tr: {
    invalid: "Token geçersiz veya süresi dolmuş.",
    required: "Eksik bilgi.",
    weak: "Şifre en az 8 karakter, harf ve rakam içermeli.",
    user: "Kullanıcı bulunamadı.",
    used: "Bu sıfırlama linki zaten kullanılmış.",
    success: "Şifre başarıyla değiştirildi.",
    fail: "Şifre sıfırlanamadı.",
    ratelimit: "Çok fazla istek. Lütfen tekrar deneyin.",
  }
};

export const POST = csrf(async (req) => {
  try {
    const langHeader = req.headers.get("accept-language") || "";
    const locale = langHeader.startsWith("tr") ? "tr" : "en";
    const msg = messages[locale];

    // IP Rate limit
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(`pwreset_confirm_${ip}`, 5, 60 * 1000)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    const { token, password } = await req.json();
    if (!token || !password) {
      return Response.json({ success: false, message: msg.required }, { status: 400 });
    }
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return Response.json({ success: false, message: msg.weak }, { status: 400 });
    }

    // Token kontrolü
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return Response.json({ success: false, message: msg.invalid }, { status: 400 });
    }

    // User kontrolü
    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      return Response.json({ success: false, message: msg.user }, { status: 404 });
    }

    // Şifre güncelle
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed }
    });

    // Tokenı kullanılmış yap
    await prisma.passwordResetToken.update({
      where: { token },
      data: { used: true }
    });

    return Response.json({ success: true, message: msg.success });
  } catch (err) {
    console.error("PASSWORD RESET CONFIRM ERROR:", err);
    return Response.json({ success: false, message: messages.tr.fail }, { status: 500 });
  }
});
