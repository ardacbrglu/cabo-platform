export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

// Basit güvenli isim temizleyici
function sanitizeName(input) {
  if (typeof input !== "string") return "";
  const noTags = input.replace(/<[^>]*>/g, "");
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
  const currencies = await prisma.currency.findMany({ select: { code: true } });
  return currencies.map((c) => c.code);
}

function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

export async function POST(req) {
  try {
    // Content-Type
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return secureJson({ error: "Unsupported Media Type" }, { status: 415 });
    }

    // 1) CSRF
    await validateCsrfToken(req);

    // 2) Auth
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return secureJson({ error: "Unauthorized" }, { status: 401 });

    // 3) Rate limit
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:update:u:${userId}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (!ok) {
      return secureJson(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 4) Body + dinamik doğrulama
    const body = await req.json().catch(() => ({}));
    const { name, languagePreference, currencyCode } = body || {};

    const supportedLangs = await getSupportedLanguages();
    const supportedCurrencies = await getSupportedCurrencies();

    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      !supportedLangs.includes(languagePreference) ||
      !supportedCurrencies.includes(currencyCode)
    ) {
      return secureJson({ error: "Invalid input" }, { status: 400 });
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

    return secureJson({ success: true });
  } catch (err) {
    console.error("POST /api/settings/update error:", err);
    return secureJson({ error: "Server error" }, { status: 500 });
  }
}
