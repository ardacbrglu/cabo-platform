export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

export async function GET(req) {
  try {
    // 1) Rate limit (50 req/dk IP bazlı)
    const rlKey = makeRateLimitKey(req, { scope: "platform_info" });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 50, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 2) Konfigleri tek sorguda çek
    const configs = await prisma.platformConfig.findMany({
      where: { keyName: { in: ["platform_account_name", "platform_iban"] } },
    });
    const map = Object.fromEntries(configs.map((c) => [c.keyName, c.value]));

    // 3) Güvenli JSON + cache kapalı
    return NextResponse.json(
      {
        platform_account_name: map.platform_account_name || "-",
        platform_iban: map.platform_iban || "-",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Pragma": "no-cache",
          "Vary": "Cookie",
        },
      }
    );
  } catch (err) {
    // Prod’da genel hata
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
