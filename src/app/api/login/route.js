// src/app/api/login/route.js
import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkRateLimit } from '@/lib/ratelimit';

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY';
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_COUNT = 10;

const messages = {
  en: { /* ... */ },
  tr: { /* ... */ }
};

export const POST = csrf(async (req) => {
  try {
    const lang = req.headers.get('accept-language') || '';
    const locale = lang.startsWith('tr') ? 'tr' : 'en';
    const msg = messages[locale];

    // Rate limit kontrolü
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(`login_${ip}`, RATE_LIMIT_COUNT, RATE_LIMIT_WINDOW)) {
      return Response.json({ success: false, message: msg.ratelimit }, { status: 429 });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ success: false, message: msg.fill }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }
    if (user.role === 'merchant') {
      return Response.json({ success: false, message: msg.merchant }, { status: 403 });
    }
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return Response.json({ success: false, message: msg.invalid }, { status: 401 });
    }

    const token = jwt.sign({
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role
    }, JWT_SECRET, { expiresIn: '7d' });

    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append(
      'Set-Cookie',
      `cabo_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax;${process.env.NODE_ENV === 'production' ? ' Secure' : ''}`
    );

    return new Response(
      JSON.stringify({ success: true, message: msg.success }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    const msg = messages.tr.fail;
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
