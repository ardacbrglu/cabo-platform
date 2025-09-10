export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { cookies } from "next/headers";

/* ---------- CSRF (NextAuth) ---------- */
function readCsrfCookieValue() {
  const store = cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}
function validateCsrfOrDeny(req) {
  const method = req?.method?.toUpperCase?.() || "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  const headerToken = req.headers.get("X-CSRF-Token") || req.headers.get("x-csrf-token") || "";
  const cookieToken = readCsrfCookieValue();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

export async function POST(req) {
  const csrfErr = validateCsrfOrDeny(req);
  if (csrfErr) return csrfErr;

  try {
    const session = await getServerSession(authOptions);
    const userIdRaw = session?.user?.id ?? session?.user?.userId ?? null;
    const userId = Number.isInteger(Number(userIdRaw)) ? Number(userIdRaw) : null;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rlKey = makeRateLimitKey(req, { scope: "notif:markread", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const ids = (Array.isArray(body?.ids) ? body.ids : [])
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (!ids.length) {
      return NextResponse.json({ error: "No valid ids" }, { status: 400 });
    }

    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId, isDeleted: false },
      data: { read: true },
    });

    const res = NextResponse.json({ success: true });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("POST /api/notifications/mark-read error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
