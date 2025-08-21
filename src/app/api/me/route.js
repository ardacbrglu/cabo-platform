export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/me/route.js
 * Purpose: Oturum bilgisini minimal ve DÜZ döndür (status/role dahil).
 * Sözleşme:
 *  - 200 OK + { authenticated:false }  → anon
 *  - 200 OK + { authenticated:true, id, email, name, role, status } → auth
 *  - Cache: no-store; Vary: Cookie
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";

function json(payload, init = {}) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

export async function GET(req) {
  // 60/dk IP rate-limit
  const ipKey = makeRateLimitKey(req, { scope: "me:ip" });
  const rl = await checkRateLimit({ key: ipKey, limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return json(
      { authenticated: false, retry_after: Math.ceil(rl.resetMs / 1000) },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    );
  }

  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase?.();
    if (!email) {
      // 401 yerine 200 + authenticated:false
      return json({ authenticated: false });
    }

    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    if (!u) return json({ authenticated: false });

    // DÜZ yapı:
    return json({
      authenticated: true,
      id: u.id,
      email: u.email,
      name: u.name || "",
      role: u.role || "affiliate",
      status: u.status || "active",
    });
  } catch {
    // Güvenli fallback: UI patlamasın
    return json({ authenticated: false });
  }
}
