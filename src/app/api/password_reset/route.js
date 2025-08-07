// SORUMLULUK: Kullanıcı email ile reset linki ister. Her zaman generic mesaj döner.
// Rate limit, CSRF, brute-force ve token hijacking korumalı.

export const dynamic = "force-dynamic";

import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { sendPasswordResetEmail } from '@/lib/mailer';
import { addMinutes } from 'date-fns';
import { checkRateLimit } from '@/lib/ratelimit';

const messages = {
  en: {
    required: "Email is required.",
    sent: "If user exists, password reset email sent.",
    fail: "Error sending password reset email.",
    ratelimit: "Too many requests. Please wait and try again.",
  },
  tr: {
    required: "E-posta gerekli.",
    sent: "Kullanıcı varsa şifre sıfırlama e-postası gönderildi.",
    fail: "Şifre sıfırlama e-postası gönderilirken hata oluştu.",
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
    if (!checkRateLimit(`pwreset_req_${ip}`, 5, 60 * 1000)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    // E-mail zorunlu
    const { email } = await req.json();
    if (!email) {
      return Response.json({ success: false, message: msg.required }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();

    // User kontrolü (gizli)
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return Response.json({ success: true, message: msg.sent });
    }

    // Token üretimi (benzersiz, 15 dk geçerli)
    const token = uuidv4();
    const expires = addMinutes(new Date(), 15);

    // Eski tokenları sil
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, used: false }
    });

    // Yeni token kaydı
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: expires,
        used: false,
      }
    });

    // Mail gönder
    await sendPasswordResetEmail(user.email, token);

    return Response.json({ success: true, message: msg.sent });
  } catch (err) {
    console.error("PASSWORD RESET REQ ERROR:", err);
    return Response.json({ success: false, message: messages.tr.fail }, { status: 500 });
  }
});
