export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/notifications/create  (admin)
 * Body:
 *  - { message: string, type?: "info"|"support_reply"|"important", link?: string|null,
 *      all?: boolean, userId?: number|string }
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { cookies } from "next/headers";

const VALID_TYPES = ["info", "support_reply", "important"];

/* ---------- CSRF (NextAuth) ---------- */
async function readCsrfCookieValue() {
  const store = await cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}

async function validateCsrfOrDeny(req) {
  const method = req?.method?.toUpperCase?.() || "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;

  const headerToken = req.headers.get("X-CSRF-Token") || req.headers.get("x-csrf-token") || "";
  const cookieToken = await readCsrfCookieValue();

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

export async function POST(req) {
  try {
    const csrfErr = await validateCsrfOrDeny(req);
    if (csrfErr) return csrfErr;

    const session = await getServerSession(authOptions);
    const user = session?.user;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rlKey = makeRateLimitKey(req, { scope: "notif:create", userId: user.id });
    const rl = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetMs || 0) / 1000)) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || "").trim();
    const type = VALID_TYPES.includes(String(body?.type)) ? String(body.type) : "info";
    const link = body?.link ? String(body.link).trim() : null;
    const all = Boolean(body?.all);

    const targetUserIdRaw = body?.userId ?? null;
    const targetUserId = Number.isFinite(Number(targetUserIdRaw)) ? Number(targetUserIdRaw) : null;

    if (message.length < 2) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    if (all) {
      const users = await prisma.user.findMany({
        where: { status: "active" },
        select: { id: true },
      });
      if (!users.length) {
        return NextResponse.json({ error: "No users found" }, { status: 400 });
      }

      await prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          message,
          type,
          link,
          read: false,
          isDeleted: false,
        })),
        skipDuplicates: true,
      });

      const res = NextResponse.json({ ok: true, count: users.length });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    await prisma.notification.create({
      data: { userId: targetUserId, message, type, link, read: false, isDeleted: false },
    });

    const res = NextResponse.json({ ok: true, count: 1 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("POST /api/notifications/create error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
