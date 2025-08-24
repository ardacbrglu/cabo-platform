// src/app/api/platform_info/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma için önemli

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  // cache & güvenlik başlıkları
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

export async function GET(req) {
  try {
    // 1) Rate limit (50 req/dk, IP scoped)
    const rlKey = makeRateLimitKey(req, { scope: "platform_info" });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 50, windowMs: 60_000 });
    if (!ok) {
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 60_000) / 1000)) } }
      );
    }

    // 2) Konfigleri tek seferde çek — hem keyName hem key alanı ile uyumlu
    const KEYS = ["platform_account_name", "platform_iban"];
    const rows = await prisma.platformConfig.findMany({
      where: {
        OR: [
          { keyName: { in: KEYS } },
          { key: { in: KEYS } }, // eski/alternatif şema desteği
        ],
      },
      select: { keyName: true, key: true, value: true },
    });

    // 3) Map oluştur (keyName varsa onu, yoksa key’i kullan)
    const map = {};
    for (const r of rows) {
      const k = r.keyName || r.key;
      if (k) map[k] = r.value ?? "";
    }

    // 4) Yanıt
    return json({
      platform_account_name: map.platform_account_name || "-",
      platform_iban: map.platform_iban || "-",
    });
  } catch (err) {
    // Prod’da genel hata
    return json({ error: "Server error" }, { status: 500 });
  }
}
