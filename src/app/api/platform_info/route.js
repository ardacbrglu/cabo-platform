export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ← Prisma için önemli

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET(req) {
  try {
    // 1) Rate limit (50 req/dk IP bazlı)
    const rlKey = makeRateLimitKey(req, { scope: "platform_info" });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 50, windowMs: 60_000 });
    if (!ok) {
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 2) Konfigleri tek sorguda çek
    const configs = await prisma.platformConfig.findMany({
      where: { keyName: { in: ["platform_account_name", "platform_iban"] } },
      select: { keyName: true, value: true },
    });
    const map = Object.fromEntries(configs.map((c) => [c.keyName, c.value]));

    // 3) Yanıt
    return json({
      platform_account_name: map.platform_account_name || "-",
      platform_iban: map.platform_iban || "-",
    });
  } catch (err) {
    // Prod’da genel hata
    return json({ error: "Server error" }, { status: 500 });
  }
}
