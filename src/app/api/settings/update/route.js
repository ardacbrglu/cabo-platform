// src/app/api/settings/update/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/settings/update
 * - Auth, CSRF (+ same-site fallback), RL
 * - Kısmi payload kabul
 * - Case-insensitive doğrulama (lang lower, currency upper)
 * - Değişiklik yoksa: { success:true, noChange:true }
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/ratelimit";
import { cookies } from "next/headers";

/* ---------- helpers ---------- */
function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

function readCsrfCookieValue() {
  const store = cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}

/** Header tutmazsa same-site fallback (Origin/Referer == self origin + csrf cookie mevcut) */
function validateCsrfOrTrustSameSite(req) {
  const method = req?.method?.toUpperCase?.() || "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;

  const headerToken =
    req.headers.get("X-CSRF-Token") ||
    req.headers.get("x-csrf-token") ||
    "";
  const cookieToken = readCsrfCookieValue();
  if (headerToken && cookieToken && headerToken === cookieToken) return null;

  // fallback
  const selfOrigin = new URL(req.url).origin;
  const envOrigin = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : selfOrigin;
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  const refererOrigin = referer ? (() => { try { return new URL(referer).origin; } catch { return ""; } })() : "";

  const sameSite = (origin && origin === envOrigin) || (refererOrigin && refererOrigin === envOrigin);
  if (sameSite && cookieToken) return null;

  return secureJson({ success: false, errorKey: "csrf" }, { status: 403 });
}

function sanitizeName(input) {
  if (typeof input !== "string") return "";
  const noTags = input.replace(/<[^>]*>/g, "");
  return noTags.trim().slice(0, 80);
}

async function getSupportedLanguages() {
  const cfg = await prisma.platformConfig.findUnique({ where: { keyName: "languages" } });
  try { if (cfg && cfg.value) return (JSON.parse(cfg.value) || []).map((x) => String(x).toLowerCase()); } catch {}
  return ["en", "tr"];
}
async function getSupportedCurrencies() {
  const rows = await prisma.currency.findMany({ select: { code: true } });
  return rows.map((r) => String(r.code).toUpperCase());
}

export async function POST(req) {
  try {
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return secureJson({ success: false, errorKey: "unsupported_media" }, { status: 415 });
    }

    // CSRF (with same-site fallback)
    const csrfErr = validateCsrfOrTrustSameSite(req);
    if (csrfErr) return csrfErr;

    // Auth
    const session = await getServerSession(authOptions);
    const userId = Number(session?.user?.id ?? session?.user?.userId ?? NaN);
    if (!Number.isFinite(userId)) {
      return secureJson({ success: false, errorKey: "unauthorized" }, { status: 401 });
    }

    // RL
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:update:u:${userId}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (!ok) {
      return secureJson(
        { success: false, errorKey: "too_many" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } },
      );
    }

    // Body
    const body = await req.json().catch(() => ({}));
    let { name, languagePreference, currencyCode } = body || {};

    const prev = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, languagePreference: true, currencyCode: true },
    });
    if (!prev) return secureJson({ success: false, errorKey: "unauthorized" }, { status: 401 });

    // normalize
    const nextNameRaw = typeof name === "string" ? name : prev.name;
    const nextLang = String(typeof languagePreference === "string" ? languagePreference : prev.languagePreference || "en").toLowerCase();
    const nextCurr = String(typeof currencyCode === "string" ? currencyCode : prev.currencyCode || "TRY").toUpperCase();

    const supportedLangs = await getSupportedLanguages();
    const supportedCurrencies = await getSupportedCurrencies();

    if (!supportedLangs.includes(nextLang) || !supportedCurrencies.includes(nextCurr)) {
      return secureJson({ success: false, errorKey: "invalid_input" }, { status: 400 });
    }

    const nextName = sanitizeName(nextNameRaw);
    if (nextName.length < 2) {
      return secureJson({ success: false, errorKey: "invalid_input" }, { status: 400 });
    }

    const noChange =
      nextName === prev.name &&
      nextLang === String(prev.languagePreference || "").toLowerCase() &&
      nextCurr === String(prev.currencyCode || "").toUpperCase();

    if (noChange) {
      return secureJson({ success: true, noChange: true }, { status: 200 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { name: nextName, languagePreference: nextLang, currencyCode: nextCurr },
    });

    return secureJson({ success: true }, { status: 200 });
  } catch (err) {
    console.error("POST /api/settings/update error:", err);
    return secureJson({ success: false, errorKey: "server" }, { status: 500 });
  }
}
