import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/ratelimit";

export async function GET(req) {
  try {
    // Rate limit (opsiyonel, abuse için)
    await checkRateLimit(req, "platform_info", 50, 60_000, "platform-info-get");

    // Tek sorguda çek
    const configs = await prisma.platform_config.findMany({
      where: { key_name: { in: ["platform_account_name", "platform_iban"] } }
    });
    const map = Object.fromEntries(configs.map(c => [c.key_name, c.value]));
    return NextResponse.json({
      platform_account_name: map.platform_account_name || "-",
      platform_iban: map.platform_iban || "-"
    });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
