export const dynamic = "force-dynamic";

/**
 * /app/api/me/route.js
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

export async function GET(req) {
  // 1) Rate limit
  const rlKey = makeRateLimitKey(req, { scope: "me" });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
    );
  }

  // 2) Session
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase?.();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 3) Güvenli alanlar (email ile çek → id tip uyumsuzluğu riski yok)
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      languagePreference: true,
      currencyCode: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 4) UserContext ile uyumlu yanıt
  return NextResponse.json(
    {
      userId: user.id,
      name: user.name || null,
      email: user.email,
      role: user.role,
      status: user.status,
      languagePreference: user.languagePreference || null,
      currencyCode: user.currencyCode || "TRY",
    },
    { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
  );
}
