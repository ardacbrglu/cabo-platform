export const dynamic = "force-dynamic";

import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/ratelimit';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

export async function GET(req) {
  try {
    // 1) Rate limit (60 request/dk aynı IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || "unknown";
    if (!(await checkRateLimit(`me_${ip}`, 60, 60_000))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // 2) Cookie'den JWT oku
    const cookieStore = cookies();
    const token = cookieStore.get('cabo_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3) JWT doğrula ve kullanıcı ID’sini al
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = payload.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 4) User fetch & sanitize
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        languagePreference: true,
        currencyCode: true,
        passwordHash: true, // create_password sayfası için gerekli!
      }
    });
    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 5) Safe response
    return NextResponse.json(user);

  } catch (err) {
    console.error('GET /api/me error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
