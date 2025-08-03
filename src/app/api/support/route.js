// app/api/support/route.js

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit } from '@/lib/ratelimit';
import { z } from 'zod';
import { sanitizeHtml } from '@/lib/validation';

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

// Zod şeması: mesaj en az 1, en çok 900 karakter
const supportSchema = z.object({
  message: z.string().min(1).max(900)
});

export async function POST(req) {
  try {
    // 1) CSRF koruması
    await validateCsrfToken(req);

    // 2) Kimlik doğrulama (JWT cookie)
    const cookieStore = cookies();
    const token = cookieStore.get('cabo_token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) Rate-limit / spam kontrolü: dakikada max 5 mesaj
    if (!checkRateLimit(`support:${userId}`, 5, 60 * 1000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 4) Body parse ve şema validasyonu
    const parsed = supportSchema.parse(await req.json());
    const cleanMessage = sanitizeHtml(parsed.message.trim());

    // 5) Kullanıcı bilgilerini çek
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { name: true, email: true }
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 6) Mesajı DB'ye kaydet
    await prisma.contactMessage.create({
      data: {
        userId,
        name: user.name,
        email: user.email,
        message: cleanMessage
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Support API error:", err);
    // Hata detaylarını sakla; kullanıcıya genel mesaj döndür
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
