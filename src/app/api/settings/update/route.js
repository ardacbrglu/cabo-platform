// app/api/settings/update/route.js
export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { validatecsrf_token } from '@/lib/csrf';
import { checkRateLimit } from '@/lib/ratelimit';
import { sanitizeHtml } from '@/lib/validation';

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
  return currencies.map(c => c.code);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET");

export async function POST(req) {
  try {
    await validatecsrf_token(req);
    const store = await cookies();
    const token = store.get('cabo_token')?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    const userId = payload.userId;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!checkRateLimit(`settings:update:${userId}`, 5, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { name, languagePreference, currencyCode } = body;
    // Dinamik doğrulama:
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

    const nameClean = sanitizeHtml(name.trim());
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: nameClean,
        languagePreference,
        currencyCode
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/settings/update error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
