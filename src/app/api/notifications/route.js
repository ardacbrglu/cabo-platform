// app/api/notifications/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

export async function GET(req) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rlKey = makeRateLimitKey(req, { scope: "notif:list", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    const where = { userId, isDeleted: false, ...(unreadOnly ? { read: false } : {}) };

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json(
      { total, notifications },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
    );
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
