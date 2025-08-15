// app/api/notifications/route.js  (JS)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

function noStoreJson(body, init = {}) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET(req) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

    const rlKey = makeRateLimitKey(req, { scope: "notif:list", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    if (!ok) {
      return noStoreJson(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const where = { userId, isDeleted: false, ...(unreadOnly ? { read: false } : {}) };

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" } }),
    ]);

    return noStoreJson({ total, notifications });
  } catch (err) {
    console.error("GET /api/notifications error:", err);

    // Tablo yoksa / schema uymuyorsa — uygulamayı çökertme, boş dön
    const code = err?.code || "";
    const msg = String(err?.message || "");
    if (["P2021", "P2022", "P2010"].includes(code) || /table .* does not exist/i.test(msg)) {
      return noStoreJson({ total: 0, notifications: [] });
    }

    return noStoreJson({ error: "Internal Server Error" }, { status: 500 });
  }
}
