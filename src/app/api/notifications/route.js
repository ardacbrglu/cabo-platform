export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/notifications
 * Hata üretmesin diye güvenli, toleranslı bir uç.
 * Oturum varsa kullanıcıya özel bildirimi döner; yoksa boş dizi döner.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET(req) {
  try {
    // Hafif rate-limit
    const { ok, resetMs } = await checkRateLimit({
      key: makeRateLimitKey(req, { scope: "notifications:ip" }),
      limit: 60,
      windowMs: 60_000,
    });
    if (!ok) {
      return json(
        { error: "too_many_requests", items: [] },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ? Number(session.user.id) : null;

    // Oturum yoksa boş dön (giriş sayfası bu uçtan istek atabiliyor)
    if (!userId) return json({ items: [] });

    // Tablo yok ya da boş olabilir; hata kaçırma
    let rows = [];
    try {
      rows = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, body: true, createdAt: true, read: true },
      });
    } catch {
      // tablo yoksa sessizce boş dön
      rows = [];
    }

    return json({
      items: rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        read: !!n.read,
      })),
    });
  } catch (e) {
    console.error("GET /api/notifications error:", e);
    return json({ items: [] }); // 200 + boş
  }
}
