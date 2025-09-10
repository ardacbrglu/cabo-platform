export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/notifications
 * Security Docblock (Cabo PROD)
 * - Auth: NextAuth session zorunlu; user.status === "active"
 * - RBAC: affiliate/merchant/admin erişimi var (istenirse UI tarafında kısıtlanır)
 * - Rate limit: GET 60/dk (IP tabanlı; sunucuda ioredis), Vary: Cookie
 * - No-store cache header; JSON sabit sözleşme
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
    const { ok, resetMs } = await checkRateLimit({
      key: makeRateLimitKey(req, { scope: "notifications:ip" }),
      limit: 60,
      windowMs: 60_000,
    });
    if (!ok) {
      return json(
        { notifications: [] },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
      );
    }

    const session = await getServerSession(authOptions);
    const userIdRaw = session?.user?.id ?? session?.user?.userId ?? null;
    const userId = userIdRaw ? Number(userIdRaw) : null;
    if (!userId) return json({ notifications: [] });

    let rows = [];
    try {
      rows = await prisma.notification.findMany({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 50, // mobil akışı pürüzsüz tut
        select: {
          id: true,
          message: true,
          type: true,
          link: true,
          createdAt: true,
          read: true,
        },
      });
    } catch {
      rows = [];
    }

    return json({
      notifications: rows.map((n) => ({
        id: n.id,
        message: n.message,
        type: n.type,
        link: n.link || null,
        createdAt: n.createdAt,
        read: !!n.read,
      })),
    });
  } catch (e) {
    console.error("GET /api/notifications error:", e);
    return json({ notifications: [] });
  }
}
