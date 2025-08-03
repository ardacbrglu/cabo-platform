import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY';
const VALID_TYPES = ['info', 'support_reply', 'important'];

export async function POST(req) {
  try {
    // 1. Auth kontrol (sadece admin)
    const cookieStore = cookies();
    const token = cookieStore.get('cabo_token')?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }
    catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Body al ve validasyon
    const body = await req.json();
    const { message, userId, all, type = 'info', link } = body;

    if (!message || message.length < 2)
      return NextResponse.json({ error: "Message required" }, { status: 400 });

    if (!VALID_TYPES.includes(type))
      return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });

    // 3. Bildirimi ekle
    if (all) {
      // Herkese (tüm user'lara)
      const users = await prisma.user.findMany({
        where: { status: 'active' }, // veya hepsi için: where: {}
        select: { id: true }
      });
      if (!users.length)
        return NextResponse.json({ error: "No users found" }, { status: 400 });

      const data = users.map(u => ({
        userId: u.id,
        message,
        type,
        link: link || null,
        read: false
      }));

      await prisma.notification.createMany({ data });
      return NextResponse.json({ ok: true, count: data.length });
    } else {
      // Sadece belirli userId'ye
      if (!userId)
        return NextResponse.json({ error: "userId required" }, { status: 400 });

      await prisma.notification.create({
        data: {
          userId,
          message,
          type,
          link: link || null,
          read: false
        }
      });
      return NextResponse.json({ ok: true, count: 1 });
    }
  } catch (err) {
    console.error("Notification Create Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
