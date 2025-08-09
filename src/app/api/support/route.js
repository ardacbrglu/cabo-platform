// app/api/support/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";

/**
 * SECURITY NOTES
 * - Auth: NextAuth session (custom JWT cookie yok)
 * - CSRF: Header (x-csrf-token | csrf-token) + Cookie (csrf_token) eşleşmesi zorunlu
 * - Rate limit: userId bazlı 5 req/dk
 * - Validation: Zod ile trim + min/max
 */

// Zod şeması (trim + uzunluk kontrolü)
const supportSchema = z.object({
  message: z
    .string()
    .transform((s) => s.trim())
    .min(1, "Message is required")
    .max(900, "Message too long"),
});

// Basit, güvenli bir düz metin temizleyici (HTML taglarını siler)
function sanitizePlaintext(s) {
  // HTML taglarını ve kontrol karakterlerini temizle
  return s.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

export async function POST(req) {
  try {
    // 1) CSRF koruması
    validateCsrfToken(req);

    // 2) Kimlik doğrulama (NextAuth session)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) Rate limit (kullanıcı başına 5/dk)
    const rlKey = makeRateLimitKey(req, { scope: "support", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 4) Body parse + şema validasyonu
    const body = await req.json().catch(() => ({}));
    const parsed = supportSchema.parse(body);
    const cleanMessage = sanitizePlaintext(parsed.message);

    // 5) Kullanıcı bilgisi (gerekli alanlar)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 6) Mesajı DB'ye kaydet
    await prisma.contactMessage.create({
      data: {
        userId, // int
        name: user.name || null,
        email: user.email || null,
        message: cleanMessage,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    // production’da generic mesaj
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
