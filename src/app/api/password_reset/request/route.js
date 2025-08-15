export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { withCsrfProtection } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { addMinutes } from "date-fns";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

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
  },
};

export const POST = withCsrfProtection(async (req) => {
  const langHeader = req.headers.get("accept-language") || "";
  const locale = langHeader.toLowerCase().startsWith("tr") ? "tr" : "en";
  const msg = messages[locale];

  try {
    // Rate limit (IP bazlı 5/dk)
    const rlKey = makeRateLimitKey(req, { scope: "pwreset_req" });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    if (!ok) {
      return new Response(JSON.stringify({ success: false, message: msg.ratelimit }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil(resetMs / 1000)),
        },
      });
    }

    // Body
    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // Enumeration-safe response
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return new Response(JSON.stringify({ success: true, message: msg.sent }), {
        status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // Eski kullanılmamış tokenları temizle
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, used: false } });

    // 15 dk geçerli yeni token
    const token = uuidv4();
    const expiresAt = addMinutes(new Date(), 15);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt, used: false },
    });

    // Mail gönder (kullanıcının dil tercihi varsa onu kullan)
    const language = user.languagePreference || locale;
    await sendPasswordResetEmail(user.email, token, language);

    return new Response(JSON.stringify({ success: true, message: msg.sent }), {
      status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("PASSWORD RESET REQ ERROR:", err);
    return new Response(JSON.stringify({ success: false, message: messages.tr.fail }), {
      status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
