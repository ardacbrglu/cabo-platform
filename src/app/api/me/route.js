// app/api/me/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /app/api/me
 * Loginli kullanıcının güvenli profil özetini döner.
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
  // 1) Rate limit (60/dk, IP)
  const rlKey = makeRateLimitKey(req, { scope: "me" });
  const { ok, resetMs } = await checkRateLimit({
    key: rlKey,
    limit: 60,
    windowMs: 60_000,
  });
  if (!ok) {
    return json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
    );
  }

  // 2) Session
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  // 3) Güvenli seçim
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
  if (!user) return json({ error: "Not found" }, { status: 404 });

  // 4) UserContext uyumlu yanıt
  return json({
    userId: user.id,
    name: user.name || null,
    email: user.email,
    role: user.role,
    status: user.status,
    languagePreference: user.languagePreference || null,
    currencyCode: user.currencyCode || "TRY",
  });
}
