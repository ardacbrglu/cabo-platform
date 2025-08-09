// app/api/me/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

export async function GET(req) {
  try {
    // 1) Rate limit (60 req/dk IP bazlı)
    const rlKey = makeRateLimitKey(req, { scope: "me" });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 2) NextAuth session
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) User fetch (sadece güvenli alanlar)
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

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 4) Response (UserContext şemasına UYUMLU: userId + alanlar)
    return NextResponse.json(
      {
        userId: user.id, // <— ÖNEMLİ: UserContext bunu bekliyor
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        languagePreference: user.languagePreference,
        currencyCode: user.currencyCode,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Vary": "Cookie",
        },
      }
    );
  } catch (err) {
    console.error("GET /api/me error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
