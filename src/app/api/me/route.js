export const dynamic = "force-dynamic";

/**
 * /app/api/me/route.js
 * Amaç: Oturum açmış kullanıcının temel ve güvenli profil bilgilerini döner.
 *
 * SECURITY NOTES
 * - Auth: NextAuth session (custom JWT yok).
 * - Rate limit: IP bazlı sınırlama.
 * - Response şeması UserContext beklentisiyle UYUMLU (userId zorunlu).
 * - Hassas alanlar (passwordHash vs.) asla seçilmez.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

export async function GET(req) {
  // 1) Rate limit (60 req/dk IP bazlı)
  const rlKey = makeRateLimitKey(req, { scope: "me" });
  const { ok, resetMs } = await checkRateLimit({
    key: rlKey,
    limit: 60,
    windowMs: 60_000,
  });

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
    // Oturum yok → anon
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) DB'den sadece güvenli alanlar
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

  // 4) UserContext ile birebir uyumlu yanıt
  return NextResponse.json(
    {
      userId: user.id, // UserContext bunu bekliyor
      name: user.name || null,
      email: user.email,
      role: user.role,
      status: user.status,
      languagePreference: user.languagePreference || null,
      currencyCode: user.currencyCode || "TRY", // Varsayılan TL
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Vary: "Cookie",
      },
    }
  );
}
