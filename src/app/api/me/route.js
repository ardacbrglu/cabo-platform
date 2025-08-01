// app/api/me/route.js
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/ratelimit';

// Require a real secret in ENV — fail fast if missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

export async function GET(req) {
  try {
    // 1) Simple IP-based rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (!(await checkRateLimit(`me_${ip}`, 60, 60_000))) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // 2) Read token from cookie
    const cookieStore = await cookies();
    const token = cookieStore.get('cabo_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3) Verify JWT
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user_id = payload.user_id ?? payload.userId;
    if (!user_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 4) Fetch and sanitize user
    const user = await prisma.user.findUnique({
      where: { user_id },
      select: {
        user_id: true,
        name: true,
        email: true,
        role: true,
        language_preference: true,
        currency_code: true
      }
    });
    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 5) Return only the safe fields
    return NextResponse.json(user);

  } catch (err) {
    console.error('GET /api/me error:', err);
    // Mask any internal detail
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
