export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/ratelimit";

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

    // 2) Önce NextAuth session'ı kontrol et
    let userId = null;
    const session = await getServerSession(authOptions);

    if (session && session.user && session.user.id) {
      userId = session.user.id;
    } else {
      // 3) Manuel JWT (cabo_token) ile kontrol et
      const cookieStore = cookies();
      const token = cookieStore.get('cabo_token')?.value;
      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET);
          userId = payload.userId;
        } catch {
          // invalid token, userId null kalır
        }
      }
    }

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
        // passwordHash: true, // sadece şifre oluşturma için gerekiyorsa aç
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
