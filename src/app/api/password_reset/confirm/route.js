// app/api/password_reset/confirm/route.js
export const dynamic = "force-dynamic";

import { withCsrfProtection } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

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
  },
};

export const POST = withCsrfProtection(async (req) => {
  try {
    const langHeader = req.headers.get("accept-language") || "";
    const locale = langHeader.startsWith("tr") ? "tr" : "en";
    const msg = messages[locale];

    // Rate limit (IP bazlı 5/dk)
    const rlKey = makeRateLimitKey(req, { scope: "pwreset_confirm" });
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

    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!token || !password) {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return new Response(JSON.stringify({ success: false, message: msg.weak }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Token doğrula
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record) {
      return new Response(JSON.stringify({ success: false, message: msg.invalid }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (record.used) {
      return new Response(JSON.stringify({ success: false, message: msg.used }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (record.expiresAt < new Date()) {
      return new Response(JSON.stringify({ success: false, message: msg.invalid }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Kullanıcıyı çek
    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: msg.user }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Şifreyi güncelle
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Token'ı kullanılmış işaretle
    await prisma.passwordResetToken.update({
      where: { token },
      data: { used: true },
    });

    return new Response(JSON.stringify({ success: true, message: msg.success }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PASSWORD RESET CONFIRM ERROR:", err);
    return new Response(JSON.stringify({ success: false, message: messages.tr.fail }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
