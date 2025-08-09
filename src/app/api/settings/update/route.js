export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

// Basit güvenli isim temizleyici (validation dosyan yoksa)
function sanitizeName(input) {
  if (typeof input !== "string") return "";
  // HTML taglarını ve kontrol karakterlerini at
  const noTags = input.replace(/<[^>]*>/g, "");
  // Trim ve soft normalize
  return noTags.trim().slice(0, 80);
}

// DİNAMİK: PlatformConfig ve Currencies
async function getSupportedLanguages() {
  const config = await prisma.platformConfig.findUnique({ where: { keyName: "languages" } });
  try {
    if (config && config.value) return JSON.parse(config.value);
  } catch {}
  return ["en", "tr"];
}

async function getSupportedCurrencies() {
  const currencies = await prisma.currency.findMany();
  return currencies.map((c) => c.code);
}

export async function POST(req) {
  try {
    // 1) CSRF
    validateCsrfToken(req);

    // 2) Auth
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 3) Rate limit
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:update:u:${userId}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 4) Body + dinamik doğrulama
    const body = await req.json();
    const { name, languagePreference, currencyCode } = body || {};

    const supportedLangs = await getSupportedLanguages();
    const supportedCurrencies = await getSupportedCurrencies();

    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      !supportedLangs.includes(languagePreference) ||
      !supportedCurrencies.includes(currencyCode)
    ) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const nameClean = sanitizeName(name);

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: nameClean,
        languagePreference,
        currencyCode,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/settings/update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
