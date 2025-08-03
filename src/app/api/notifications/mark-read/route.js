export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_KEY';

export async function POST(req) {
  const cookieStore = cookies();
  const token = cookieStore.get('cabo_token')?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

  const userId = decoded.userId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids } = await req.json();
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids" }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId },
    data: { read: true },
  });

  return NextResponse.json({ success: true });
}
