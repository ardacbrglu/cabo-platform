// /app/api/notifications/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

    const rlKey = makeRateLimitKey(req, { scope: "notif:list", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    if (!ok) {
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const where = { userId, isDeleted: false, ...(unreadOnly ? { read: false } : {}) };

    let total = 0;
    let notifications = [];
    try {
      total = await prisma.notification.count({ where });
      notifications = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
    } catch (e) {
      const msg = String(e?.message || "");
      const code = e?.code;
      if (
        code === "P2021" ||
        code === "P2023" ||
        /table|relation.*does not exist/i.test(msg)
      ) {
        return json({ total: 0, notifications: [] });
      }
      throw e;
    }

    return json({ total, notifications });
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
}
