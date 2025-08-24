// src/app/api/merchant_settings/update/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Merchant Settings Update (POST)
 * - AuthZ: requireMerchant()  → sadece merchant güncelleyebilir
 * - CSRF:  NextAuth double-submit (header === cookie)
 * - RL:    5/dk kullanıcı başına
 * - Cache: no-store + Vary: Cookie
 * - Güvenlik: X-Requested-With + Origin/Referer host doğrulaması
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireMerchant } from "@/lib/guards";
import { checkRateLimit } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";

/* ---------- helpers ---------- */
function json(payload, init = {}) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

function sanitizeName(input) {
  if (typeof input !== "string") return "";
  const noTags = input.replace(/<[^>]*>/g, "");
  return noTags.trim().slice(0, 80);
}

// NextAuth double-submit CSRF check (header token === cookie token)
function readNextAuthCookieToken(cookieHeader = "") {
  if (!cookieHeader) return null;
  const m =
    cookieHeader.match(/(?:^|;\s*)(?:__Host-)?next-auth\.csrf-token=([^;]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).split("|")[0]; } catch { return null; }
}
function validateNextAuthCsrf(req) {
  const method = (req.method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  const hdr = req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
  if (!hdr) return false;
  const cookieTok = readNextAuthCookieToken(req.headers.get("cookie") || "");
  return !!cookieTok && cookieTok === hdr;
}

// AJAX + aynı origin koruması
function enforceOrigin(req) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return true;

  const xrw = (req.headers.get("x-requested-with") || "").toLowerCase();
  if (xrw !== "xmlhttprequest") return false;

  const host = req.headers.get("host") || "";
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  const envUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || "";

  const toHost = (v) => {
    if (!v) return "";
    try { return new URL(v.startsWith("http") ? v : `https://${v}`).host; }
    catch { return v; }
  };
  const allowed = new Set([toHost(host), toHost(envUrl)].filter(Boolean));
  const ok = (u) => {
    if (!u) return true;
    try { return allowed.has(new URL(u).host); } catch { return false; }
  };

  return ok(origin) && ok(referer);
}

async function getSupportedLanguages() {
  try {
    const row = await prisma.platformConfig.findUnique({ where: { keyName: "languages" } });
    if (row?.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr) && arr.length) return arr.map(String);
    }
  } catch {}
  return ["en", "tr"];
}
async function getSupportedCurrencies() {
  try {
    const rows = await prisma.currency.findMany({ select: { code: true } });
    const list = rows.map((r) => r.code).filter(Boolean);
    return list.length ? list : ["TRY"];
  } catch {
    return ["TRY"];
  }
}

/* ---------- POST ---------- */
export async function POST(req) {
  try {
    // Content-Type
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return json({ error: "unsupported_media_type" }, { status: 415 });
    }

    // AJAX + Origin/Referer
    if (!enforceOrigin(req)) {
      return json({ error: "bad_origin" }, { status: 403 });
    }

    // CSRF (NextAuth)
    if (!validateNextAuthCsrf(req)) {
      return json({ error: "csrf_invalid" }, { status: 403 });
    }

    // AuthZ (merchant)
    const { userId } = await requireMerchant();

    // Rate limit 5/dk
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:merchant:update:${userId}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (!ok) {
      const s = Math.ceil((resetMs || 60_000) / 1000);
      return json({ error: "too_many_requests", retry_after: s }, { status: 429, headers: { "Retry-After": String(s) } });
    }

    // Body
    const body = await req.json().catch(() => ({}));
    const { name, languagePreference, currencyCode } = body || {};

    const langs = await getSupportedLanguages();
    const currs = await getSupportedCurrencies();

    const nameOk = typeof name === "string" && name.trim().length >= 2;
    const langOk = typeof languagePreference === "string" && langs.includes(languagePreference);
    const curOk  = typeof currencyCode === "string" && currs.includes(currencyCode);

    if (!nameOk || !langOk || !curOk) {
      return json({ error: "invalid_input" }, { status: 400 });
    }

    // Update
    const clean = sanitizeName(name);
    await prisma.user.update({
      where: { id: userId },
      data: { name: clean, languagePreference, currencyCode },
    });

    return json({
      success: true,
      name: clean,
      languagePreference,
      currencyCode,
    });
  } catch (err) {
    console.error("[merchant_settings/update] error:", err);
    // requireMerchant 401/403 atarsa burada 500'e düşmesin:
    const code = err?.code === 401 ? 401 : err?.code === 403 ? 403 : 500;
    const key  = code === 500 ? "server_error" : (code === 401 ? "unauthorized" : "forbidden");
    return json({ error: key }, { status: code });
  }
}
