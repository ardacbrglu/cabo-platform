export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { sendActivationEmail } from "@/lib/mailer";
import { csrf } from "@/lib/csrf";

// Güvenlik kontrolü
if (!process.env.JWT_SECRET) {
  throw new Error("❌ JWT_SECRET is not defined in environment variables.");
}
const JWT_SECRET = process.env.JWT_SECRET;

// Çoklu dil destekli mesajlar
const messages = {
  en: {
    invalid: "Invalid request.",
    notFound: "No account found with this email.",
    alreadyActive: "Account already activated.",
    rateLimit: "You can only request 3 activation emails per day.",
    resent: "A new activation link has been sent to your email.",
    fail: "Something went wrong. Please try again.",
  },
  tr: {
    invalid: "Geçersiz istek.",
    notFound: "Bu e-posta ile kayıtlı bir hesap bulunamadı.",
    alreadyActive: "Hesap zaten aktifleştirilmiş.",
    rateLimit: "Günde en fazla 3 aktivasyon e-postası isteyebilirsiniz.",
    resent: "Yeni aktivasyon bağlantısı e-postanıza gönderildi.",
    fail: "Bir hata oluştu. Lütfen tekrar deneyin.",
  },
};

export const POST = csrf(async (req) => {
  try {
    const langHeader = req.headers.get("accept-language") || "";
    const locale = langHeader.startsWith("tr") ? "tr" : "en";
    const msg = messages[locale];

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return Response.json({ success: false, message: msg.invalid }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      return Response.json({ success: false, message: msg.notFound }, { status: 404 });
    }

    if (user.status === "active" || user.emailVerified) {
      return Response.json({ success: false, message: msg.alreadyActive }, { status: 400 });
    }

    // Günlük gönderim sınırı kontrolü
    const now = new Date();
    const last = user.lastActivationRequestAt || new Date(0);
    const isSameDay = now.toDateString() === last.toDateString();

    if (isSameDay && user.activationRequestedCount >= 3) {
      return Response.json({ success: false, message: msg.rateLimit }, { status: 429 });
    }

    // Yeni aktivasyon token oluştur
    const newToken = jwt.sign({ email: cleanEmail }, JWT_SECRET, { expiresIn: "1d" });

    // Veritabanını güncelle (eski token geçersizleşir)
    await prisma.user.update({
      where: { email: cleanEmail },
      data: {
        activationToken: newToken,
        activationRequestedCount: isSameDay ? user.activationRequestedCount + 1 : 1,
        lastActivationRequestAt: now,
      },
    });

    // Aktivasyon e-postası gönder
    try {
      await sendActivationEmail(cleanEmail, newToken);
    } catch (err) {
      console.error("❌ Email send error:", err);
      return Response.json({ success: false, message: msg.fail }, { status: 500 });
    }

    return Response.json({ success: true, message: msg.resent });
  } catch (err) {
    console.error("❌ Resend Activation Error:", err);
    return Response.json({ success: false, message: messages.tr.fail }, { status: 500 });
  }
});
