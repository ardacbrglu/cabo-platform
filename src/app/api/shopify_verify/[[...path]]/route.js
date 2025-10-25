export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shopify S2S Verify + Click Write (per-merchant secret, CaboSettings'ten)
 *
 * İstek (JSON):
 * {
 *   shopDomain: "ace-dev-01-2.myshopify.com",
 *   productUrl: "https://ace-dev-01-2.myshopify.com/products/xyz",
 *   token: "abcd1234....",
 *   lid: 123,                // optional, number or numeric string
 *   keyId: "TESTSHOP1",
 *   ts: 1730000000000,      // Date.now()
 *   sig: "<hex>"            // HMAC_SHA256(secret, canonicalString)
 * }
 *
 * canonicalString (tam sıralama):
 *   keyId=<keyId>&shopDomain=<shopDomain>&productUrl=<productUrl>&token=<token>&lid=<lidOrEmpty>&ts=<ts>
 *
 * HMAC:
 *   secret = CaboSettings.hmacSecret (merchant'a özel)
 *
 * Güvenlik:
 *   - 5dk tazelik penceresi (replay azaltma)
 *   - Rate limit (shopDomain+IP)
 *   - Host eşleşmesi: productUrl.host, merchantUrl.host ile veya shopDomain ile uyumlu olmalı
 *   - 30dk dedup (linkId + ip + ua)
 *   - Başarılı doğrulamada Click.verifiedFrom = "shopify:<shopDomain>"
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import crypto from "node:crypto";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { audit } from "@/lib/logger";

const CLICK_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 dakika
const FRESH_MS = 5 * 60 * 1000;               // 5 dakika

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
    const given = Buffer.from((sigHex || ""), "hex");
    if (mac.length !== given.length) return false;
    return crypto.timingSafeEqual(mac, given);
  } catch {
    return false;
  }
}

const BodySchema = z.object({
  shopDomain: z.string().min(6).max(200),
  productUrl: z.string().url().max(2048),
  token: z.string().min(16).max(128),
  lid: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  keyId: z.string().min(3).max(64),
  ts: z.union([z.number().int(), z.string().min(10)]),
  sig: z.string().regex(/^[a-f0-9]{32,128}$/i),
});

export async function POST(req) {
  // Server-to-server istek olduğundan CORS/Origin/CSRF istemiyoruz; HMAC yeterli.
  // Yine de rate-limit uyguluyoruz.
  const rlKey = makeRateLimitKey(req, { scope: "shopify_verify" });
  const rl = await checkRateLimit({ key: rlKey, limit: 180, windowMs: 60_000 });
  if (!rl.ok) {
    return json(
      { error: "rate_limited", retry_after: Math.ceil((rl.resetMs || 0) / 1000) },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_params" }, { status: 400 });
  }

  const shopDomain = parsed.data.shopDomain.toLowerCase();
  const productUrl = parsed.data.productUrl;
  const token = parsed.data.token;
  const lid = parsed.data.lid != null ? Number(parsed.data.lid) : null;
  const keyId = parsed.data.keyId;
  const tsRaw = parsed.data.ts;
  const sig = parsed.data.sig;

  // ts: tazelik kontrolü
  const tsNum = typeof tsRaw === "string" && /^\d+$/.test(tsRaw) ? Number(tsRaw) : Number(tsRaw);
  if (!Number.isFinite(tsNum)) return json({ error: "bad_timestamp" }, { status: 400 });
  if (Math.abs(Date.now() - tsNum) > FRESH_MS) {
    return json({ error: "stale_request" }, { status: 400 });
  }

  // 1) Merchant ayarlarını çek (CaboSettings)
  const settings = await prisma.caboSettings.findFirst({
    where: { shopDomain },
    select: { shopDomain: true, keyId: true, hmacSecret: true },
  });

  if (!settings || !settings.hmacSecret || !settings.keyId) {
    audit?.({ evt: "verify.settings_missing", shopDomain });
    return json({ error: "merchant_not_registered" }, { status: 403 });
  }

  // keyId eşleşmeli
  if (settings.keyId !== keyId) {
    audit?.({ evt: "verify.key_mismatch", shopDomain, given: keyId });
    return json({ error: "key_mismatch" }, { status: 403 });
  }

  // 2) HMAC doğrulaması
  const canonical = `keyId=${keyId}&shopDomain=${shopDomain}&productUrl=${productUrl}&token=${token}&lid=${lid ?? ""}&ts=${tsNum}`;
  const ok = timingSafeHmacVerify(settings.hmacSecret, canonical, sig);
  if (!ok) {
    audit?.({ evt: "verify.bad_sig", shopDomain });
    return json({ error: "bad_signature" }, { status: 401 });
  }

  try {
    // 3) Link çözümleme (token + optional lid), aktif ürün ve süresi dolmamış link
    const now = new Date();
    let link = null;

    const whereCommon = {
      token,
      isVisible: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      product: { isActive: true },
    };

    if (lid !== null) {
      link = await prisma.affiliateLink.findFirst({
        where: { ...whereCommon, linkId: lid },
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

    // 4) Host doğrulaması: productUrl mağazaya ait mi?
    let targetHost = "";
    try {
      targetHost = new URL(link.product.merchantUrl).host.toLowerCase();
    } catch {
      return json({ error: "bad_product_url" }, { status: 400 });
    }
    let incomingHost = "";
    try {
      incomingHost = new URL(productUrl).host.toLowerCase();
    } catch {
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

    // 5) Dedup + click yaz
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

    // 6) İstemciye cookie rehberi (isteğe bağlı)
    return json({
      ok: true,
      linkId: link.linkId,
      productId: link.productId,
      token,
      cookie: { name: "cabo_ref", value: token, maxAgeDays: 14 },
    });
  } catch (e) {
    console.error("[shopify_verify] error:", e?.message || e);
    audit?.({ evt: "verify.error", err: (e?.message || String(e)).slice(0, 200) });
    return json({ error: "server_error" }, { status: 500 });
  }
}
