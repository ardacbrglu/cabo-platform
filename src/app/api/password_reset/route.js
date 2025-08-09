// app/api/password_reset/request/route.js
export const dynamic = "force-dynamic";

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
  try {
    const langHeader = req.headers.get("accept-language") || "";
    const locale = langHeader.startsWith("tr") ? "tr" : "en";
    const msg = messages[locale];

    // Rate limit (IP bazlı 5/dk)
    const rlKey = makeRateLimitKey(req, { scope: "pwreset_req" });
    const { ok } = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    if (!ok) {
      return new Response(JSON.stringify({ success: false, message: msg.ratelimit }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Kullanıcıyı bul (enumeration önleme: response her durumda generic)
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return new Response(JSON.stringify({ success: true, message: msg.sent }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Önce önceki kullanılmamış tokenları temizle
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, used: false },
    });

    // Yeni kısa ömürlü token (15dk)
    const token = uuidv4();
    const expiresAt = addMinutes(new Date(), 15);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        used: false,
      },
    });

    // Mail dilini kullanıcı tercihi ya da accept-language
    const language = user.languagePreference || locale;
    await sendPasswordResetEmail(user.email, token, language);

    return new Response(JSON.stringify({ success: true, message: msg.sent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PASSWORD RESET REQ ERROR:", err);
    return new Response(JSON.stringify({ success: false, message: messages.tr.fail }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
