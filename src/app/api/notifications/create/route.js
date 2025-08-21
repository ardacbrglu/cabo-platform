// app/api/notifications/create/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/authz";
import prisma from "@/lib/prisma";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

const VALID_TYPES = ["info", "support_reply", "important"];

export const POST = withCsrfProtection(async (req) => {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rlKey = makeRateLimitKey(req, { scope: "notif:create", userId: user.id });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || "").trim();
    const type = String(body?.type || "info");
    const link = body?.link ? String(body.link).trim() : null;
    const all = Boolean(body?.all);
    const targetUserId = body?.userId ? String(body.userId) : null;

    if (message.length < 2) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
    }

    if (all) {
      const users = await prisma.user.findMany({
        where: { status: "active" },
        select: { id: true },
      });
      if (!users.length) {
        return NextResponse.json({ error: "No users found" }, { status: 400 });
      }
      const data = users.map((u) => ({
        userId: u.id,
        message,
        type,
        link,
        read: false,
        isDeleted: false,
      }));
      await prisma.notification.createMany({ data, skipDuplicates: true });
      return NextResponse.json(
        { ok: true, count: data.length },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    await prisma.notification.create({
      data: { userId: targetUserId, message, type, link, read: false, isDeleted: false },
    });
    return NextResponse.json({ ok: true, count: 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/notifications/create error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
