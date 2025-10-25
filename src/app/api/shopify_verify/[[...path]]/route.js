export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabo — Shopify Verify API (CORS + App Proxy + S2S HMAC)
 * Accuracy-first rev:
 *  - Token birden fazla linke bağlıysa (ambiguous) lid zorunludur (lid_required)
 *  - Tek link varsa lid opsiyoneldir
 *  - DB hataları best-effort (audit'e loglanır, 500 oluşmaz)
 *  - CORS her durumda set edilir
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import crypto from "node:crypto";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { audit } from "@/lib/logger";

// ---- Tunables ----
const CLICK_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 dk
const S2S_FRESH_MS = 5 * 60 * 1000;          // 5 dk
const PROXY_FRESH_MS = 10 * 60 * 1000;       // 10 dk

// ---- helpers ----
function j(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}
function corsify(res, origin) {
  if (!origin) return res;
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "content-type,x-shopify-shop-domain");
  return res;
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
    const given = Buffer.from((sigHex || ""), "hex");
    if (mac.length !== given.length) return false;
    return crypto.timingSafeEqual(mac, given);
  } catch {
    return false;
  }
}
/** Shopify App Proxy query imzası */
function verifyAppProxySignature(fullUrl) {
  const APP_SECRET =
    process.env.SHOPIFY_API_SECRET ||
    process.env.SHOPIFY_APP_SECRET ||
    process.env.SHOPIFY_CLIENT_SECRET;

  const u = new URL(fullUrl);
  const sp = new URLSearchParams(u.search);
  const signature = sp.get("signature");
  if (!APP_SECRET || !signature) return { ok: false, reason: "missing_secret_or_signature" };

  sp.delete("signature");
  const base = Array.from(sp.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const digest = crypto.createHmac("sha256", APP_SECRET).update(base).digest("hex");
  if (digest !== signature) return { ok: false, reason: "bad_signature" };

  const tsSec = Number(sp.get("timestamp") || 0);
  if (tsSec) {
    const skew = Math.abs(Date.now() - tsSec * 1000);
    if (skew > PROXY_FRESH_MS) return { ok: false, reason: "stale_timestamp" };
  }
  return { ok: true };
}

// ---- validation ----
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

// ---- core ----
async function findLinkByTokenAndMaybeLid({ token, lid }) {
  // Tek/çok link durumunu saptayalım (isVisible + not expired + product active)
  const now = new Date();
  const whereCommon = {
    token,
    isVisible: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    product: { isActive: true },
  };

  // 1) lid verilmişse doğrudan onu dene
  if (lid != null) {
    try {
      const link = await prisma.affiliateLink.findFirst({
        where: { ...whereCommon, linkId: Number(lid) },
        select: {
          linkId: true,
          productId: true,
          product: { select: { merchantUrl: true, isActive: true } },
        },
      });
      if (link) return { link, ambiguous: false };
    } catch (e) {
      audit?.({ evt: "verify.link_query_by_lid_error", token, lid, err: String(e?.message || e).slice(0, 300) });
    }
    return { link: null, ambiguous: false }; // lid verildi ama bulunamadı
  }

  // 2) lid yoksa: aynı token için kaç aktif link var?
  try {
    const sample = await prisma.affiliateLink.findMany({
      where: whereCommon,
      select: {
        linkId: true,
        productId: true,
        product: { select: { merchantUrl: true, isActive: true } },
      },
      orderBy: { linkId: "desc" },
      take: 2, // iki tane bile varsa ambiguous kabul edeceğiz
    });

    if (sample.length === 0) return { link: null, ambiguous: false };
    if (sample.length === 1) return { link: sample[0], ambiguous: false };
    return { link: null, ambiguous: true }; // birden fazla link → lid şart
  } catch (e) {
    audit?.({ evt: "verify.link_query_multi_error", token, err: String(e?.message || e).slice(0, 300) });
    // Sorgu bile patladıysa ambiguous diyemeyiz; akışı durdurmayalım.
    return { link: null, ambiguous: false };
  }
}

async function performVerificationAndClick({ shopDomain, productUrl, token, lid, req }) {
  // 0) Merchant kayıtlı mı?
  let settingsOk = false;
  try {
    const settings = await prisma.caboSettings.findFirst({
      where: { shopDomain },
      select: { shopDomain: true },
    });
    settingsOk = !!settings;
  } catch (e) {
    audit?.({ evt: "verify.settings_query_error", shopDomain, err: String(e?.message || e).slice(0, 300) });
  }
  if (!settingsOk) {
    audit?.({ evt: "verify.settings_missing", shopDomain });
    return j({ ok: false, error: "merchant_not_registered" }, { status: 403 });
  }

  // 1) Link tespiti (lid → direkt, yoksa tek-link fallback, çoksa zorunlu)
  const { link, ambiguous } = await findLinkByTokenAndMaybeLid({ token, lid });

  if (ambiguous) {
    // Aynı token altında birden fazla link var → ürün doğruluğu için lid şart
    return j({ ok: false, error: "lid_required" }, { status: 200 });
  }
  if (!link || !link.product?.isActive) {
    audit?.({ evt: "verify.link_not_found", shopDomain, token, lid });
    return j({ ok: false, error: "not_found" }, { status: 404 });
  }

  // 2) Host kontrolü
  let targetHost = "";
  let incomingHost = "";
  try { targetHost = new URL(link.product.merchantUrl).host.toLowerCase(); } catch {}
  try { incomingHost = new URL(productUrl).host.toLowerCase(); } catch {}

  if (!targetHost || !incomingHost) {
    return j({ ok: false, error: "bad_product_url" }, { status: 400 });
  }
  const sameShop =
    incomingHost === targetHost ||
    incomingHost === shopDomain ||
    targetHost.endsWith(".myshopify.com") ||
    incomingHost.endsWith(".myshopify.com");

  if (!sameShop) {
    audit?.({ evt: "verify.host_mismatch", shopDomain, incomingHost, targetHost });
    return j({ ok: false, error: "host_mismatch" }, { status: 403 });
  }

  // 3) Click kayıt (best-effort; hata doğrulamayı bozmaz)
  const ip = getClientIp(req);
  const ua = safeHeader(req.headers.get("user-agent"), 512) || "unknown";
  const ref = safeHeader(req.headers.get("referer") || req.headers.get("referrer"), 2048);

  try {
    let exists = null;
    try {
      const cutoff = new Date(Date.now() - CLICK_DEDUP_WINDOW_MS);
      exists = await prisma.click.findFirst({
        where: {
          linkId: link.linkId,
          ipAddress: ip,
          userAgent: ua,
          clickedAt: { gte: cutoff },
        },
        select: { clickId: true },
      });
    } catch (e) {
      audit?.({ evt: "verify.dedup_error", linkId: link.linkId, err: String(e?.message || e).slice(0, 300) });
    }

    if (!exists) {
      try {
        await prisma.click.create({
          data: {
            linkId: link.linkId,
            ipAddress: ip,
            userAgent: ua,
            referrer: ref || null,
            verifiedFrom: `shopify:${shopDomain}`,
            clickedAt: new Date(),
          },
        });
      } catch (e) {
        audit?.({ evt: "verify.click_create_error", linkId: link.linkId, err: String(e?.message || e).slice(0, 300) });
        // Minimal fallback (yalnızca zorunlu alanlarla)
        try {
          await prisma.click.create({ data: { linkId: link.linkId } });
        } catch (e2) {
          audit?.({ evt: "verify.click_create_minimal_error", linkId: link.linkId, err: String(e2?.message || e2).slice(0, 300) });
        }
      }

      try {
        await prisma.merchantProduct.update({
          where: { productId: link.productId },
          data: { totalClicks: { increment: 1 } },
        });
      } catch (e) {
        audit?.({ evt: "verify.product_click_inc_error", productId: link.productId, err: String(e?.message || e).slice(0, 300) });
      }
    } else {
      audit?.({ evt: "verify.dedup_skip", linkId: link.linkId, ip });
    }
  } catch (e) {
    audit?.({ evt: "verify.db_top_error", err: String(e?.message || e).slice(0, 300) });
  }

  return j({
    ok: true,
    linkId: link.linkId,
    productId: link.productId,
    token,
    cookie: { name: "cabo_ref", value: token, maxAgeDays: 14 },
  });
}

// ---- handlers ----

// CORS verify (browser → /api/shopify_verify/verify?shop=...)
async function handleCorsVerify(req) {
  const origin = req.headers.get("origin") || "";
  try {
    const shopHeader = (req.headers.get("x-shopify-shop-domain") || "").toLowerCase().trim();
    const shopParam = (new URL(req.url)).searchParams.get("shop")?.toLowerCase().trim() || "";

    if (!origin || !shopHeader) {
      return corsify(j({ ok: false, error: "missing_origin_or_shop" }, { status: 200 }), origin);
    }
    let originHost = "";
    try { originHost = new URL(origin).host.toLowerCase(); } catch {}
    if (originHost !== shopHeader || (shopParam && shopParam !== shopHeader)) {
      return corsify(j({ ok: false, error: "shop_mismatch" }, { status: 200 }), origin);
    }

    let body = {};
    try { body = await req.json(); }
    catch { return corsify(j({ ok: false, error: "invalid_json" }, { status: 200 }), origin); }

    const parsed = ProxyBodySchema.safeParse(body);
    if (!parsed.success) {
      return corsify(j({ ok: false, error: "invalid_params" }, { status: 200 }), origin);
    }

    const res = await performVerificationAndClick({
      shopDomain: shopHeader,
      productUrl: parsed.data.productUrl,
      token: parsed.data.token,
      lid: parsed.data.lid != null ? Number(parsed.data.lid) : null,
      req,
    });

    // performVerificationAndClick j() ile dönüyor; burada sadece CORS ekliyoruz
    return corsify(res, origin);
  } catch (e) {
    audit?.({ evt: "verify.cors_handler_crash", err: String(e?.message || e).slice(0, 300) });
    return corsify(j({ ok: false, error: "server_error" }, { status: 200 }), origin);
  }
}

// App Proxy (/apps/cabo/verify?...signature=...)
async function handleProxy(req) {
  const url = new URL(req.url);

  if (url.searchParams.get("ping") === "1") {
    return j({ ok: true, ping: "pong", path: url.pathname });
  }

  const sig = verifyAppProxySignature(req.url);
  if (!sig.ok) return j({ ok: false, error: sig.reason }, { status: 401 });

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
  } catch {}

  const input = {
    token: body?.token ?? url.searchParams.get("token") ?? "",
    productUrl: body?.productUrl ?? url.searchParams.get("productUrl") ?? "",
    lid: body?.lid ?? url.searchParams.get("lid") ?? undefined,
  };

  const parsed = ProxyBodySchema.safeParse(input);
  if (!parsed.success || !shopDomain) {
    return j({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  return performVerificationAndClick({
    shopDomain,
    productUrl: parsed.data.productUrl,
    token: parsed.data.token,
    lid: parsed.data.lid != null ? Number(parsed.data.lid) : null,
    req,
  });
}

// S2S (Remix/başka server → HMAC’li)
async function handleS2S(req) {
  const rlKey = makeRateLimitKey(req, { scope: "shopify_verify_s2s" });
  const rl = await checkRateLimit({ key: rlKey, limit: 180, windowMs: 60_000 });
  if (!rl.ok) {
    return j({ ok: false, error: "rate_limited", retry_after: Math.ceil((rl.resetMs || 0) / 1000) }, { status: 429 });
  }

  let body;
  try { body = await req.json(); } catch { return j({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const parsed = S2SBodySchema.safeParse(body);
  if (!parsed.success) return j({ ok: false, error: "invalid_params" }, { status: 400 });

  const { shopDomain: rawShop, productUrl, token, lid, keyId, ts, sig } = parsed.data;
  const shopDomain = rawShop.toLowerCase();

  const tsNum = typeof ts === "string" && /^\d+$/.test(ts) ? Number(ts) : Number(ts);
  if (!Number.isFinite(tsNum)) return j({ ok: false, error: "bad_timestamp" }, { status: 400 });
  if (Math.abs(Date.now() - tsNum) > S2S_FRESH_MS) {
    return j({ ok: false, error: "stale_request" }, { status: 400 });
  }

  // Merchant HMAC anahtarları
  let settings;
  try {
    settings = await prisma.caboSettings.findFirst({
      where: { shopDomain },
      select: { keyId: true, hmacSecret: true },
    });
  } catch (e) {
    audit?.({ evt: "verify.s2s_settings_error", shopDomain, err: String(e?.message || e).slice(0, 300) });
  }
  if (!settings?.hmacSecret || !settings?.keyId) {
    audit?.({ evt: "verify.settings_missing", shopDomain });
    return j({ ok: false, error: "merchant_not_registered" }, { status: 403 });
  }
  if (settings.keyId !== keyId) {
    audit?.({ evt: "verify.key_mismatch", shopDomain, given: keyId });
    return j({ ok: false, error: "key_mismatch" }, { status: 403 });
  }

  const canonical = `keyId=${keyId}&shopDomain=${shopDomain}&productUrl=${productUrl}&token=${token}&lid=${lid ?? ""}&ts=${tsNum}`;
  const ok = timingSafeHmacVerify(settings.hmacSecret, canonical, sig);
  if (!ok) {
    audit?.({ evt: "verify.bad_sig", shopDomain });
    return j({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  return performVerificationAndClick({
    shopDomain,
    productUrl,
    token,
    lid: lid != null ? Number(lid) : null,
    req,
  });
}

// ---- router ----
export async function OPTIONS(req) {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/verify")) {
    const origin = req.headers.get("origin") || "";
    const res = new Response(null, { status: 204 });
    return corsify(res, origin);
  }
  return new Response(null, { status: 204 });
}

export async function GET(req) {
  const u = new URL(req.url);
  if (u.searchParams.has("signature")) return handleProxy(req);
  return j({ ok: true, route: "root" });
}

export async function POST(req) {
  const u = new URL(req.url);
  if (u.pathname.endsWith("/verify")) return handleCorsVerify(req);
  if (u.searchParams.has("signature")) return handleProxy(req);
  return handleS2S(req);
}
