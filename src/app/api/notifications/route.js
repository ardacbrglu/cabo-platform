export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY';

export async function GET(req) {
  // 1) Cookie'den token'ı al
  const cookieStore = await cookies();
  const token = cookieStore.get('cabo_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2) JWT doğrula
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch { return NextResponse.json({ error: 'Invalid token' }, { status: 401 }); }

  const userId = decoded.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 3) Sadece okunmamış istenirse ?unreadOnly=true
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

  // Silinmişleri gösterme!
  const where = { userId, isDeleted: false };
  if (unreadOnly) where.read = false;

  // 4) DB’den çek
  const total = await prisma.notification.count({ where });
  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ total, notifications });
}
