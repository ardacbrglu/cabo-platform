// src/app/api/shopify_verify/[[...path]]/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Modes
 * - App Proxy:  /apps/<subpath>/verify  → query'de "signature" olur (Shopify imzası)
 * - CORS S2S:   /api/shopify_verify/verify?shop=<shop>.myshopify.com  (bu cevap CORS header’ları ile gelir)
 *
 * Güvenlik:
 * - App Proxy: query.signature + timestamp, APP_SECRET ile doğrulama
 * - S2S: body HMAC (merchant özel hmacSecret) + tazelik
 * - Rate limit, host doğrulaması, dedup
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import crypto from "node:crypto";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { audit } from "@/lib/logger";

// windows
const CLICK_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 dk
const S2S_FRESH_MS = 5 * 60 * 1000;          // 5 dk
const PROXY_FRESH_MS = 10 * 60 * 1000;       // 10 dk

// ---------- tiny helpers ----------
function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
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
function timingSafeHmacVerify(secret, base, sigHex) {
  try {
    const mac = crypto.createHmac("sha256", secret).update(base).digest();
    const given = Buffer.from(sigHex || "", "hex");
    if (mac.length !== given.length) return false;
    return crypto.timingSafeEqual(mac, given);
  } catch {
    return false;
  }
}

// ---------- CORS ----------
function buildCorsHeaders(req) {
  const h = new Headers();
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "content-type,x-shopify-shop-domain");
  h.set("Access-Control-Allow-Credentials", "true");

  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const shop =
    (req.headers.get("x-shopify-shop-domain") ||
      url.searchParams.get("shop") ||
      ""
    ).toLowerCase();

  // yalnızca kendi mağazan izinli
  try {
    if (origin && shop) {
      const oHost = new URL(origin).host.toLowerCase();
      if (oHost === shop) h.set("Access-Control-Allow-Origin", origin);
    }
  } catch { /* ignore */ }

  return h;
}
function withCors(req, res) {
  const cors = buildCorsHeaders(req);
  cors.forEach((v, k) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req) {
  const h = buildCorsHeaders(req);
  h.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers: h });
}

// ---------- App Proxy signature verify ----------
function verifyAppProxySignature(fullUrl) {
  const APP_SECRET =
    process.env.SHOPIFY_API_SECRET ||
    process.env.SHOPIFY_APP_SECRET ||
    process.env.SHOPIFY_CLIENT_SECRET;

  const u = new URL(fullUrl);
  const sp = new URLSearchParams(u.search);
  const signature = sp.get("signature");
  if (!APP_SECRET || !signature) {
    return { ok: false, reason: "missing_secret_or_signature" };
  }

  sp.delete("signature");
  const pairs = Array.from(sp.entries()).sort(([a], [b]) => a.localeCompare(b));
  const base = pairs.map(([k, v]) => `${k}=${v}`).join("&");

  const digest = crypto.createHmac("sha256", APP_SECRET).update(base).digest("hex");
  if (digest !== signature) return { ok: false, reason: "bad_signature" };

  const tsSec = Number(sp.get("timestamp") || 0);
  if (tsSec) {
    const skew = Math.abs(Date.now() - tsSec * 1000);
    if (skew > PROXY_FRESH_MS) return { ok: false, reason: "stale_timestamp" };
  }
  return { ok: true };
}

// ---------- zod schemas ----------
const S2SBodySchema = z.object({
  shopDomain: z.string().min(6).max(200),
  productUrl: z.string().url().max(2048),
  token: z.string().min(16).max(128),
  lid: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  keyId: z.string().min(3).max(64),
  ts: z.union([z.number().int(), z.string().min(10)]),
  sig: z.string().regex(/^[a-f0-9]{32,128}$/i),
});
const ProxyBodySchema = z.object({
  token: z.string().min(16).max(128),
  productUrl: z.string().url().max(2048),
  lid: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
}).passthrough();

// ---------- common verify + click ----------
async function performVerificationAndClick({ shopDomain, productUrl, token, lid, req }) {
  const settings = await prisma.caboSettings.findFirst({
    where: { shopDomain },
    select: { shopDomain: true },
  });
  if (!settings) {
    audit?.({ evt: "verify.settings_missing", shopDomain });
    return json({ error: "merchant_not_registered" }, { status: 403 });
  }

  const now = new Date();
  const whereCommon = {
    token,
    isVisible: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    product: { isActive: true },
  };

  let link = null;
  if (lid != null) {
    link = await prisma.affiliateLink.findFirst({
      where: { ...whereCommon, linkId: Number(lid) },
      select: {
        linkId: true,
        productId: true,
        product: { select: { merchantUrl: true, isActive: true } },
      },
    });
  }
  if (!link) {
    link = await prisma.affiliateLink.findFirst({
      where: whereCommon,
      select: {
        linkId: true,
        productId: true,
        product: { select: { merchantUrl: true, isActive: true } },
      },
      orderBy: { linkId: "desc" },
    });
  }
  if (!link || !link.product?.isActive) {
    audit?.({ evt: "verify.link_not_found", shopDomain, token, lid });
    return json({ error: "not_found" }, { status: 404 });
  }

  // host check
  let targetHost = "";
  try { targetHost = new URL(link.product.merchantUrl).host.toLowerCase(); } catch {
    return json({ error: "bad_product_url" }, { status: 400 });
  }
  let incomingHost = "";
  try { incomingHost = new URL(productUrl).host.toLowerCase(); } catch {
    return json({ error: "bad_product_url" }, { status: 400 });
  }

  const sameShop =
    incomingHost === targetHost ||
    incomingHost === shopDomain ||
    targetHost.endsWith(".myshopify.com") ||
    incomingHost.endsWith(".myshopify.com");

  if (!sameShop) {
    audit?.({ evt: "verify.host_mismatch", shopDomain, incomingHost, targetHost });
    return json({ error: "host_mismatch" }, { status: 403 });
  }

  // dedup + click
  const ip = getClientIp(req);
  const ua = safeHeader(req.headers.get("user-agent"), 512) || "unknown";
  const ref = safeHeader(req.headers.get("referer") || req.headers.get("referrer"), 2048);

  const cutoff = new Date(Date.now() - CLICK_DEDUP_WINDOW_MS);
  const exists = await prisma.click.findFirst({
    where: {
      linkId: link.linkId,
      ipAddress: ip,
      userAgent: ua,
      clickedAt: { gte: cutoff },
    },
    select: { clickId: true },
  });

  if (!exists) {
    await prisma.$transaction([
      prisma.click.create({
        data: {
          linkId: link.linkId,
          ipAddress: ip,
          userAgent: ua,
          referrer: ref || null,
          verifiedFrom: `shopify:${shopDomain}`,
          clickedAt: new Date(),
        },
      }),
      prisma.merchantProduct.update({
        where: { productId: link.productId },
        data: { totalClicks: { increment: 1 } },
      }),
    ]);
  } else {
    audit?.({ evt: "verify.dedup_skip", linkId: link.linkId, ip });
  }

  return json({
    ok: true,
    linkId: link.linkId,
    productId: link.productId,
    token,
    cookie: { name: "cabo_ref", value: token, maxAgeDays: 14 },
  });
}

// ---------- handlers ----------
async function handleProxy(req) {
  const url = new URL(req.url);

  if (url.searchParams.get("ping") === "1") {
    return json({ ok: true, ping: "pong", path: url.pathname });
  }

  const sig = verifyAppProxySignature(req.url);
  if (!sig.ok) return json({ error: sig.reason }, { status: 401 });

  const shopDomain =
    (req.headers.get("x-shopify-shop-domain") || "").toLowerCase() ||
    (url.searchParams.get("shop") || "").toLowerCase();

  let body = null;
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) body = await req.json();
    else if (ct.includes("application/x-www-form-urlencoded")) {
      const txt = await req.text();
      body = Object.fromEntries(new URLSearchParams(txt));
    }
  } catch { /* ignore */ }

  const input = {
    token: body?.token ?? url.searchParams.get("token") ?? "",
    productUrl: body?.productUrl ?? url.searchParams.get("productUrl") ?? "",
    lid: body?.lid ?? url.searchParams.get("lid") ?? undefined,
  };

  const parsed = ProxyBodySchema.safeParse(input);
  if (!parsed.success || !shopDomain) {
    return json({ error: "invalid_params" }, { status: 400 });
  }

  return performVerificationAndClick({
    shopDomain,
    productUrl: parsed.data.productUrl,
    token: parsed.data.token,
    lid: parsed.data.lid != null ? Number(parsed.data.lid) : null,
    req,
  });
}

async function handleS2S(req) {
  const rlKey = makeRateLimitKey(req, { scope: "shopify_verify_s2s" });
  const rl = await checkRateLimit({ key: rlKey, limit: 180, windowMs: 60_000 });
  if (!rl.ok) {
    return json({ error: "rate_limited", retry_after: Math.ceil((rl.resetMs || 0) / 1000) }, { status: 429 });
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, { status: 400 }); }

  const parsed = S2SBodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_params" }, { status: 400 });

  const { shopDomain: rawShop, productUrl, token, lid, keyId, ts, sig } = parsed.data;
  const shopDomain = rawShop.toLowerCase();

  const tsNum = typeof ts === "string" && /^\d+$/.test(ts) ? Number(ts) : Number(ts);
  if (!Number.isFinite(tsNum)) return json({ error: "bad_timestamp" }, { status: 400 });
  if (Math.abs(Date.now() - tsNum) > S2S_FRESH_MS) return json({ error: "stale_request" }, { status: 400 });

  const settings = await prisma.caboSettings.findFirst({
    where: { shopDomain },
    select: { keyId: true, hmacSecret: true },
  });
  if (!settings?.hmacSecret || !settings?.keyId) {
    audit?.({ evt: "verify.settings_missing", shopDomain });
    return json({ error: "merchant_not_registered" }, { status: 403 });
  }
  if (settings.keyId !== keyId) {
    audit?.({ evt: "verify.key_mismatch", shopDomain, given: keyId });
    return json({ error: "key_mismatch" }, { status: 403 });
  }

  const canonical =
    `keyId=${keyId}&shopDomain=${shopDomain}&productUrl=${productUrl}` +
    `&token=${token}&lid=${lid ?? ""}&ts=${tsNum}`;

  const ok = timingSafeHmacVerify(settings.hmacSecret, canonical, sig);
  if (!ok) {
    audit?.({ evt: "verify.bad_sig", shopDomain });
    return json({ error: "bad_signature" }, { status: 401 });
  }

  return performVerificationAndClick({
    shopDomain,
    productUrl,
    token,
    lid: lid != null ? Number(lid) : null,
    req,
  });
}

// ---------- exported HTTP methods ----------
export async function GET(req) {
  const hasProxySig = new URL(req.url).searchParams.has("signature");
  const res = hasProxySig
    ? await handleProxy(req)
    : json({ ok: true, route: "root" });
  return withCors(req, res);
}

export async function POST(req) {
  const url = new URL(req.url);
  const hasProxySig = url.searchParams.has("signature");
  const res = hasProxySig ? await handleProxy(req) : await handleS2S(req);
  return withCors(req, res);
}
