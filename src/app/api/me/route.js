export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/me/route.js
 * Purpose: Oturum bilgisini minimal döndür (status/role dahil), 401 yerine 200 döner.
 * Security Docblock:
 * - GET: Rate limit 60/dk (IP). CSRF gerekmez.
 * - Cevap: Cache-Control: no-store; Vary: Cookie; PII minimal.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

export async function GET(req) {
  // 60/dk IP RL
  const ipKey = makeRateLimitKey(req, { scope: "me:ip" });
  const rl = await checkRateLimit({ key: ipKey, limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return json(
      { authenticated: false, retry_after: Math.ceil(rl.resetMs / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase?.();
  if (!email) {
    // 401 YOK → 200 ve authenticated:false
    return json({ authenticated: false });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, status: true },
  });

  if (!user) return json({ authenticated: false });

  // success:true de ekliyoruz (compat için)
  return json({ authenticated: true, success: true, user });
}
