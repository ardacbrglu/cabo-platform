// app/api/notifications/delete/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/authz";
import prisma from "@/lib/prisma";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

export const POST = withCsrfProtection(async (req) => {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rlKey = makeRateLimitKey(req, { scope: "notif:delete", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
    const ids = idsRaw.map(String).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ error: "No ids" }, { status: 400 });
    }

    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId, isDeleted: false },
      data: { isDeleted: true },
    });

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/notifications/delete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
