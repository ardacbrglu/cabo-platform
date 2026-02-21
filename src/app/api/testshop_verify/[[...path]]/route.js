export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabo — TestShop Verify API (Catch-all) — FIXED for current Prisma schema (route.js)
 *
 * Routes:
 * - GET  /api/testshop_verify?ping=1          -> { ok:true, ping:"pong" }
 * - POST /api/testshop_verify                 -> verify (fallback)
 * - POST /api/testshop_verify/verify          -> verify (recommended)
 *
 * Contract:
 * - Valid   => 200 { ok:true, linkId, productId, slug?: string|null }
 * - Invalid => 4xx { ok:false, error:"..." }
 *
 * Security:
 * - Origin allowlist via TESTSHOP_ORIGIN (comma-separated supported)
 * - Writes click controlled by TESTSHOP_VERIFY_WRITES_CLICK=1/0
 *
 * Optional slug validation (NO schema change needed):
 * - If CABO_MAP_JSON or TESTSHOP_PRODUCT_MAP_JSON env exists and contains slug->code,
 *   it validates incoming slug against MerchantProduct.productCode.
 *
 * Debug headers:
 * - x-cabo-origin, x-cabo-claimed, x-cabo-allowed, x-cabo-allowed-origin
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

const ORIGIN_RAW = String(process.env.TESTSHOP_ORIGIN || "").trim(); // comma-separated
const WRITES_CLICK = String(process.env.TESTSHOP_VERIFY_WRITES_CLICK || "1") === "1";
const CLICK_DEDUP_WINDOW_MS = 5 * 60 * 1000;

// Optional slug->code map (same JSON format as your TestShop side)
const MAP_RAW =
  String(process.env.CABO_MAP_JSON || "").trim() ||
  String(process.env.TESTSHOP_PRODUCT_MAP_JSON || "").trim();

function splitOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\/+$/, ""));
}

const ALLOWED_ORIGINS = splitOrigins(ORIGIN_RAW);

function j(data, init = {}, dbg = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");

  // Best-effort CORS for debugging tools (not required for server-to-server)
  const firstAllowed = ALLOWED_ORIGINS[0] || "";
  if (firstAllowed) {
    res.headers.set("Access-Control-Allow-Origin", firstAllowed);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.headers.set(
      "Access-Control-Allow-Headers",
      "content-type,x-testshop-origin,x-testshop-ua,x-testshop-referer"
    );
  }

  // Debug headers (so TestShop middleware can forward to browser)
  if (dbg && typeof dbg === "object") {
    for (const [k, v] of Object.entries(dbg)) {
      if (v != null && v !== "") res.headers.set(k, String(v).slice(0, 300));
    }
  }

  return applyApiSecurityHeaders ? applyApiSecurityHeaders(res) : res;
}

function getClientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const rip = req.headers.get("x-real-ip");
  if (rip) return rip;
  return "unknown";
}

function safeHeader(h, max = 512) {
  return (h || "").toString().slice(0, max);
}

function normalizeOrigin(s) {
  return String(s || "").trim().replace(/\/+$/, "");
}

function isAllowedCaller(req) {
  const origin = normalizeOrigin(req.headers.get("origin"));
  const claimed = normalizeOrigin(req.headers.get("x-testshop-origin"));

  if (!ALLOWED_ORIGINS.length) {
    return {
      ok: false,
      reason: "missing_TESTSHOP_ORIGIN",
      dbg: { "x-cabo-origin": origin, "x-cabo-claimed": claimed, "x-cabo-allowed": "missing" },
    };
  }

  const ok =
    (origin && ALLOWED_ORIGINS.includes(origin)) ||
    (claimed && ALLOWED_ORIGINS.includes(claimed));

  return ok
    ? {
        ok: true,
        dbg: {
          "x-cabo-origin": origin,
          "x-cabo-claimed": claimed,
          "x-cabo-allowed": "true",
          "x-cabo-allowed-origin": ALLOWED_ORIGINS.join(","),
        },
      }
    : {
        ok: false,
        reason: "forbidden_origin",
        dbg: {
          "x-cabo-origin": origin || "(none)",
          "x-cabo-claimed": claimed || "(none)",
          "x-cabo-allowed": "false",
          "x-cabo-allowed-origin": ALLOWED_ORIGINS.join(","),
        },
      };
}

function parseSlugCodeMap(raw) {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj; // expected: { "product-a": { "code": "...", ... }, ... }
  } catch {
    return null;
  }
}

const SLUG_CODE_MAP = parseSlugCodeMap(MAP_RAW);

async function findLinkByTokenAndLid({ token, lid }) {
  const now = new Date();
  return prisma.affiliateLink.findFirst({
    where: {
      token,
      linkId: Number(lid),
      isVisible: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      product: { isActive: true },
    },
    select: {
      linkId: true,
      productId: true,
      product: { select: { isActive: true, productCode: true } },
    },
  });
}

async function writeClickBestEffort({ req, linkId }) {
  if (!WRITES_CLICK) return;

  const ip = getClientIp(req);
  const ua =
    safeHeader(req.headers.get("x-testshop-ua") || req.headers.get("user-agent"), 512) || "unknown";
  const ref = safeHeader(req.headers.get("x-testshop-referer") || req.headers.get("referer"), 2048);

  try {
    const cutoff = new Date(Date.now() - CLICK_DEDUP_WINDOW_MS);
    const exists = await prisma.click.findFirst({
      where: { linkId, ipAddress: ip, userAgent: ua, clickedAt: { gte: cutoff } },
      select: { clickId: true },
    });
    if (exists) return;

    await prisma.click.create({
      data: {
        linkId,
        ipAddress: ip,
        userAgent: ua,
        referrer: ref || null,
        verifiedFrom: "testshop",
        clickedAt: new Date(),
      },
    });

    // totalClicks increment (best-effort)
    try {
      const link = await prisma.affiliateLink.findUnique({
        where: { linkId },
        select: { productId: true },
      });
      if (link?.productId) {
        await prisma.merchantProduct.update({
          where: { productId: link.productId },
          data: { totalClicks: { increment: 1 } },
        });
      }
    } catch {}
  } catch (e) {
    audit?.({
      evt: "testshop_verify.click_write_error",
      linkId,
      err: String(e?.message || e).slice(0, 250),
    });
  }
}

function validateSlugAgainstProductCode(slug, productCode) {
  if (!slug) return { ok: true, mode: "no_slug" };
  if (!SLUG_CODE_MAP) return { ok: true, mode: "no_map" };

  const entry = SLUG_CODE_MAP[slug];
  const expected = String(entry?.code || "").trim();
  if (!expected) return { ok: false, mode: "map_missing_slug" };

  return expected === productCode
    ? { ok: true, mode: "map_match" }
    : { ok: false, mode: "map_mismatch" };
}

async function handleVerify(req) {
  const allow = isAllowedCaller(req);
  if (!allow.ok) {
    const status = allow.reason === "missing_TESTSHOP_ORIGIN" ? 500 : 403;
    return j({ ok: false, error: allow.reason }, { status }, allow.dbg);
  }

  const body = await req.json().catch(() => null);

  const token = String(body?.token || "").trim();
  const lid = body?.lid != null ? Number(body.lid) : NaN;
  const slug = body?.slug ? String(body.slug).trim() : "";

  if (!token || token.length < 16) return j({ ok: false, error: "bad_token" }, { status: 400 }, allow.dbg);
  if (!Number.isFinite(lid) || lid <= 0) return j({ ok: false, error: "lid_required" }, { status: 400 }, allow.dbg);

  const link = await findLinkByTokenAndLid({ token, lid });
  if (!link || !link.product?.isActive) {
    return j({ ok: false, error: "not_found_or_expired" }, { status: 404 }, allow.dbg);
  }

  // Optional slug validation using slug->code map (no schema change)
  const productCode = String(link.product?.productCode || "").trim();
  if (slug) {
    const v = validateSlugAgainstProductCode(slug, productCode);
    if (!v.ok) {
      return j(
        { ok: false, error: "slug_mismatch" },
        { status: 403 },
        { ...allow.dbg, "x-cabo-slug-check": v.mode }
      );
    }
  }

  await writeClickBestEffort({ req, linkId: link.linkId });

  return j(
    {
      ok: true,
      linkId: link.linkId,
      productId: link.productId,
      slug: slug || null,
    },
    { status: 200 },
    { ...allow.dbg, "x-cabo-slug-map": SLUG_CODE_MAP ? "on" : "off" }
  );
}

export async function OPTIONS() {
  const dbg = {
    "x-cabo-allowed-origin": ALLOWED_ORIGINS.join(","),
    "x-cabo-allowed": ALLOWED_ORIGINS.length ? "configured" : "missing",
  };
  return j({ ok: true }, { status: 204 }, dbg);
}

export async function GET(req) {
  const u = new URL(req.url);
  if (u.searchParams.get("ping") === "1") {
    return j(
      { ok: true, ping: "pong" },
      { status: 200 },
      { "x-cabo-allowed-origin": ALLOWED_ORIGINS.join(","), "x-cabo-allowed": "ping" }
    );
  }
  return j(
    { ok: true, route: "testshop_verify_root" },
    { status: 200 },
    { "x-cabo-allowed-origin": ALLOWED_ORIGINS.join(","), "x-cabo-allowed": "root" }
  );
}

export async function POST(req) {
  try {
    const u = new URL(req.url);
    // both /api/testshop_verify and /api/testshop_verify/verify go here (catch-all)
    if (u.pathname.endsWith("/verify")) return await handleVerify(req);
    return await handleVerify(req);
  } catch (e) {
    audit?.({ evt: "testshop_verify.crash", err: String(e?.message || e).slice(0, 300) });
    return j({ ok: false, error: "server_error" }, { status: 500 }, { "x-cabo-allowed": "crash" });
  }
}