// src/app/api/settings/update/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/ratelimit";
import { cookies } from "next/headers";

/* ---------- CSRF helpers ---------- */
function readCsrfCookieValue() {
  const store = cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}
function validateCsrfOrDeny(req, secureJson) {
  const method = req?.method?.toUpperCase?.() || "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  const headerToken =
    req.headers.get("X-CSRF-Token") ||
    req.headers.get("x-csrf-token") ||
    "";
  const cookieToken = readCsrfCookieValue();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return secureJson({ success: false, errorKey: "csrf" }, { status: 403 });
  }
  return null;
}

/* ---------- response helper ---------- */
function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

/* ---------- utils ---------- */
function sanitizeName(input) {
  if (typeof input !== "string") return "";
  const noTags = input.replace(/<[^>]*>/g, "");
  return noTags.trim().slice(0, 80);
}
async function getSupportedLanguages() {
  const config = await prisma.platformConfig.findUnique({ where: { keyName: "languages" } });
  try { if (config && config.value) return JSON.parse(config.value); } catch {}
  return ["en", "tr"];
}
async function getSupportedCurrencies() {
  const currencies = await prisma.currency.findMany({ select: { code: true } });
  return currencies.map((c) => c.code);
}

export async function POST(req) {
  try {
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return secureJson({ success: false, errorKey: "unsupported_media" }, { status: 415 });
    }

    // CSRF
    const csrfErr = validateCsrfOrDeny(req, secureJson);
    if (csrfErr) return csrfErr;

    // Auth
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return secureJson({ success: false, errorKey: "unauthorized" }, { status: 401 });

    // RL
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:update:u:${userId}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (!ok) {
      return secureJson(
        { success: false, errorKey: "too_many" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } },
      );
    }

    // Body
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
      return secureJson({ success: false, errorKey: "invalid_input" }, { status: 400 });
    }

    const nameClean = sanitizeName(name);

    await prisma.user.update({
      where: { id: userId },
      data: { name: nameClean, languagePreference, currencyCode },
    });

    return secureJson({ success: true });
  } catch (err) {
    console.error("POST /api/settings/update error:", err);
    return secureJson({ success: false, errorKey: "server" }, { status: 500 });
  }
}
