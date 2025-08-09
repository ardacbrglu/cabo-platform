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
  const langHeader = req.headers.get("accept-language") || "";
  const locale = langHeader.startsWith("tr") ? "tr" : "en";
  const msg = messages[locale];

  try {
    // 1) Rate limit (IP bazlı 5/dk)
    const rlKey = makeRateLimitKey(req, { scope: "pwreset_confirm" });
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

    // 2) Body parse & validate
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!token || !password) {
      return new Response(JSON.stringify({ success: false, message: msg.required }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    // Basit complexity: 8+ uzunluk, harf + rakam
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return new Response(JSON.stringify({ success: false, message: msg.weak }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // 3) Token doğrula
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record) {
      return new Response(JSON.stringify({ success: false, message: msg.invalid }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (record.used) {
      return new Response(JSON.stringify({ success: false, message: msg.used }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (record.expiresAt < new Date()) {
      return new Response(JSON.stringify({ success: false, message: msg.invalid }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // 4) Kullanıcıyı çek
    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: msg.user }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // 5) Tek transaksiyonda şifreyi güncelle + token'ı kullan + diğer tokenları temizle + kilidi sıfırla
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedAttempts: 0,
          lockUntil: null,
          ...(tx.user.fields?.passwordUpdatedAt ? { passwordUpdatedAt: new Date() } : {}),
        },
      });

      await tx.passwordResetToken.update({
        where: { token },
        data: { used: true },
      });

      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id, used: false, token: { not: token } },
      });
    });

    return new Response(JSON.stringify({ success: true, message: msg.success }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("PASSWORD RESET CONFIRM ERROR:", err);
    return new Response(JSON.stringify({ success: false, message: messages.tr.fail }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
