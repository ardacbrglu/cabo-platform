// app/api/settings/update/route.js

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit } from '@/lib/ratelimit';
import { sanitizeHtml } from '@/lib/validation';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

// 1) Gelen body için Zod şeması
const updateSchema = z.object({
  name:              z.string().min(2, "Name too short").max(100),
  language_preference: z.enum(['en','tr']),
  currencyCode:       z.enum(['EUR','TRY','USD'])
});

export async function POST(req) {
  try {
    // 2) CSRF koruması
    await validateCsrfToken(req);

    // 3) Auth: Cookie → JWT
    const store = await cookies();
    const token = store.get('cabo_token')?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    const userId = payload.userId;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 4) Rate-limit: max 5 güncelleme / dakika
    if (!checkRateLimit(`settings:update:${userId}`, 5, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 5) Body parse & validate
    const parsed = updateSchema.parse(await req.json());
    const nameClean = sanitizeHtml(parsed.name.trim());

    // 6) DB güncellemesi
    await prisma.user.update({
      where: { userId },
      data: {
        name: nameClean,
        language_preference: parsed.language_preference,
        currencyCode: parsed.currencyCode
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/settings/update error:", err);
    // 7) Error masking
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
