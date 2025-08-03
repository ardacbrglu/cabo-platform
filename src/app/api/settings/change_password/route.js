// app/api/settings/change_password/route.js

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit } from '@/lib/ratelimit';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

// Şema: her iki şifre de en az 8 karakter
const passwordSchema = z.object({
  current_password: z.string().min(8, "Too short"),
  new_password:     z.string().min(8, "Too short")
});

export async function POST(req) {
  try {
    // 1) CSRF
    await validateCsrfToken(req);

    // 2) Auth
    const store = await cookies();
    const token = store.get('cabo_token')?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    const userId = payload.userId;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 3) Rate-limit: max 3 şifre denemesi / 15 dk
    if (!checkRateLimit(`settings:pwd:${userId}`, 3, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    // 4) Body doğrulama
    const { current_password, new_password } = passwordSchema.parse(await req.json());

    // 5) Mevcut hash’i çek, doğrula
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { passwordHash: true }
    });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ok = await bcrypt.compare(current_password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    // 6) Yeni hash’i kaydet
    const newHash = await bcrypt.hash(new_password, 12);
    await prisma.user.update({
      where: { userId },
      data: { passwordHash: newHash }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/settings/change_password error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
