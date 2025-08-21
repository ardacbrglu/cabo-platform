export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma için Edge değil

/**
 * GET /api/me
 * Minimal kullanıcı kimlik bilgisi döner: id, email, role, status.
 *
 * SECURITY
 * - NextAuth session okunur (getServerSession(authOptions)).
 * - Yanıt no-store ve Vary: Cookie.
 * - Hata mesajları genel; PII sızdırılmaz.
 * - GET olduğundan CSRF gerekmez.
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
    // IP rate-limit (hafif)
    const { ok, resetMs } = await checkRateLimit({
      key: makeRateLimitKey(req, { scope: "me:ip" }),
      limit: 60,
      windowMs: 60_000,
    });
    if (!ok) {
      return json(
        { error: "too_many_requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase?.();
    if (!email) return json({ error: "unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, status: true, name: true },
    });
    if (!user) return json({ error: "unauthorized" }, { status: 401 });

    // Minimal alanlar
    return json({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      name: user.name || "",
    });
  } catch (e) {
    console.error("GET /api/me error:", e);
    return json({ error: "me_fetch_error" }, { status: 500 });
  }
}
