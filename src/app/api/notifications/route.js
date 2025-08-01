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

  const user_id = decoded.user_id;
  if (!user_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 3) Sadece okunmamış istenirse ?unreadOnly=true
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

  // Silinmişleri gösterme!
  const where = { user_id, is_deleted: false };
  if (unreadOnly) where.read = false;

  // 4) DB’den çek
  const total = await prisma.notifications.count({ where });
  const notifications = await prisma.notifications.findMany({
    where,
    orderBy: { created_at: 'desc' }
  });

  return NextResponse.json({ total, notifications });
}
