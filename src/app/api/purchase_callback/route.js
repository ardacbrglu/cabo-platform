// app/api/purchase_callback/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

/**
 * SECURITY NOTES
 * - HMAC doğrulama: keyId → secret (env) ile HMAC-SHA256(timestamp.body)
 * - Timestamp penceresi: ±5dk
 * - Replay koruması: requestId / nonce UNIQUE + 409'ları da logla
 * - IP allowlist: MerchantIntegration.webhookIpAllowlist
 * - Rate limit: IP + keyId bazlı
 * - Loglama: WebhookRequestLog (ham gövde, başlıklar, parse edilmiş gövde, durum)
 * - Idempotency: (orderId, productId) UNIQUE
 * - Sıkılaştırma: Max body boyutu, token expiresAt kontrolü, totalPurchases increment
 */

const WINDOW_S = 5 * 60; // ±5 dakika tolerans
const ALLOWED_STATUSES = ["pending", "confirmed", "canceled"];
const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? "0"); // yüzde
const MAX_BODY_BYTES = 256 * 1024; // 256KB üstünü reddet

// --- Utilities ---
function getIP(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Node 18+ WebCrypto garanti
const cryptoApi = globalThis.crypto ?? (await import("crypto")).webcrypto;

function hexToUint8Array(hex) {
  const clean = String(hex).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean)) return new Uint8Array(0);
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.substr(i * 2, 2), 16);
  return arr;
}

async function hmacVerify(secret, timestampSec, rawBody, signatureHex) {
  const enc = new TextEncoder();
  const key = await cryptoApi.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = enc.encode(`${timestampSec}.${rawBody}`);
  const sig = hexToUint8Array(signatureHex);
  if (sig.length === 0) return false;
  return cryptoApi.subtle.verify("HMAC", key, sig, data);
}

// Basit IP allowlist (virgül / boşluk ayırmalı)
function ipAllowed(ip, allowlist) {
  if (!allowlist) return true;
  const list = allowlist
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length === 0 || list.includes(ip);
}

// keyId → env secret
function resolveSecretForKeyId(keyId) {
  if (!keyId) return null;
  const envName = `MERCHANT_KEY_${keyId}`;
  return process.env[envName] || null;
}

export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req) {
  try {
    const ip = getIP(req);

    // Rate limit (IP + keyId birlikte)
    const rawKeyId = req.headers.get("x-key-id") || "-";
    const rlKey = makeRateLimitKey(req, { scope: "purchase_callback", extra: `${ip}:${rawKeyId}` });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 200, windowMs: 60_000 });
    if (!ok) {
      return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((resetMs || 0) / 1000)),
          "Cache-Control": "no-store",
        },
      });
    }

    // Headers
    const keyId = req.headers.get("x-key-id");
    const requestId = req.headers.get("x-request-id");
    const nonce = req.headers.get("x-nonce");
    const ts = req.headers.get("x-timestamp");
    const signature = req.headers.get("x-signature");
    const ua = req.headers.get("user-agent") || undefined;

    if (!keyId || !requestId || !nonce || !ts || !signature) {
      return NextResponse.json({ error: "Missing auth headers" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Integration lookup
    const integration = await prisma.merchantIntegration.findUnique({
      where: { keyId },
      select: { merchantId: true, isActive: true, webhookIpAllowlist: true /*, secretHash: true*/ },
    });
    if (!integration || !integration.isActive) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // IP allowlist
    if (!ipAllowed(ip, integration.webhookIpAllowlist || "")) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(Number(ts) * 1000 || Date.now()),
          hmac: signature,
          ip,
          ua,
          status: "unauthorized",
          error: "ip_not_allowed",
          rawBody: "",
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: null,
          itemsCount: null,
        },
      });
      return NextResponse.json({ error: "IP not allowed" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    // Timestamp penceresi
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > WINDOW_S) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(Number(ts) * 1000 || Date.now()),
          hmac: signature,
          ip,
          ua,
          status: "expired",
          error: "stale_or_invalid_timestamp",
          rawBody: "",
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: null,
          itemsCount: null,
        },
      });
      return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // (Opsiyonel) Body boyutu savunması: Content-Length varsa kontrol et
    const clen = Number(req.headers.get("content-length"));
    if (Number.isFinite(clen) && clen > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }

    // Replay “erken” kontrol (adli kayıt için 409'da da loglayacağız)
    const dup = await prisma.webhookRequestLog.findFirst({
      where: { OR: [{ requestId }, { nonce }] },
      select: { id: true },
    });
    if (dup) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature,
          ip,
          ua,
          status: "replay",
          error: "duplicate_requestId_or_nonce",
          rawBody: "",
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: null,
          itemsCount: null,
        },
      });
      return NextResponse.json({ error: "Replay detected" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }

    // HMAC doğrulama
    const secret = resolveSecretForKeyId(keyId);
    if (!secret) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature,
          ip,
          ua,
          status: "unauthorized",
          error: "secret_not_found_for_keyId",
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: null,
          itemsCount: null,
        },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // (Opsiyonel) env sırrın hash'i DB'deki secretHash ile eşleşiyor mu?
    // if (integration.secretHash?.startsWith("sha256:")) {
    //   const enc = new TextEncoder();
    //   const digest = await cryptoApi.subtle.digest("SHA-256", enc.encode(secret));
    //   const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    //   if (integration.secretHash !== `sha256:${hex}`) { ... reject ... }
    // }

    const valid = await hmacVerify(secret, tsNum, rawBody, signature);
    if (!valid) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature,
          ip,
          ua,
          status: "invalid_signature",
          error: null,
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: null,
          itemsCount: null,
        },
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // JSON parse
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature,
          ip,
          ua,
          status: "error",
          error: "invalid_json",
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: null,
          itemsCount: null,
        },
      });
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Zorunlu alanlar
    const { token, orderId, status } = body || {};
    const items = Array.isArray(body?.products)
      ? body.products
      : [
          {
            productCode: body?.productCode,
            quantity: body?.quantity,
            amount: body?.amount,
            currency: body?.currency,
          },
        ];

    if (!token || !orderId || !status || !ALLOWED_STATUSES.includes(String(status))) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature,
          ip,
          ua,
          status: "error",
          error: "missing_or_invalid_fields",
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: body,
          itemsCount: Array.isArray(items) ? items.length : null,
        },
      });
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Sadece confirmed işliyoruz
    if (String(status) !== "confirmed") {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId,
          nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature,
          ip,
          ua,
          status: "accepted",
          error: `ignored_status_${status}`,
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: body,
          itemsCount: Array.isArray(items) ? items.length : null,
        },
      });
      return NextResponse.json(
        { ok: true, message: `Order ${orderId} ignored (status=${status})` },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Log (accepted)
    const log = await prisma.webhookRequestLog.create({
      data: {
        merchantId: integration.merchantId,
        requestId,
        nonce,
        sentAt: new Date(tsNum * 1000),
        hmac: signature,
        ip,
        ua,
        status: "accepted",
        error: null,
        rawBody,
        headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        parsedBody: body,
        itemsCount: Array.isArray(items) ? items.length : null,
      },
      select: { id: true },
    });

    // Token → AffiliateLink (expiresAt + isVisible kontrol)
    const now = new Date();
    let linkBase = await prisma.affiliateLink.findFirst({
      where: { token, isVisible: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: { product: { select: { productId: true, merchantId: true, commissionRate: true, isActive: true, maxSalesLimit: true, totalPurchases: true } } },
    });

    const results = [];
    let affiliateIdForLog = null;

    for (const rawItem of items) {
      const productCode = String(rawItem?.productCode || "").trim();
      const quantity = Number(rawItem?.quantity ?? 1) || 1;
      const amount = Number(rawItem?.amount);
      if (!productCode || !Number.isFinite(amount) || amount < 0 || quantity <= 0) {
        results.push({ productCode, error: "invalid_item_data" });
        continue;
      }

      // Ürünü bul
      const product = await prisma.merchantProduct.findUnique({
        where: { productCode },
        select: {
          productId: true,
          merchantId: true,
          isActive: true,
          maxSalesLimit: true,
          totalPurchases: true,
          commissionRate: true,
        },
      });
      if (!product || product.merchantId !== integration.merchantId) {
        results.push({ productCode, error: "product_not_found_or_merchant_mismatch" });
        continue;
      }

      // Linki ürünle de doğrula (gerekirse)
      let link = linkBase;
      if (!link || link.product.productId !== product.productId) {
        link = await prisma.affiliateLink.findFirst({
          where: { token, productId: product.productId, isVisible: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          include: { product: { select: { merchantId: true, commissionRate: true, maxSalesLimit: true, totalPurchases: true, isActive: true } } },
        });
      }
      if (!link) {
        results.push({ productCode, error: "invalid_or_inactive_token" });
        continue;
      }
      affiliateIdForLog ||= link.userId;

      // Limit/aktiflik kontrolü (not: eşzamanlı isteklerde küçük taşmalar olabilir)
      const projectedTotal = (product.totalPurchases ?? 0) + quantity;
      if (!product.isActive || (product.maxSalesLimit != null && projectedTotal > product.maxSalesLimit)) {
        // limit aşılırsa ürünü kapat (savunmacı yaklaşım)
        await prisma.merchantProduct.update({
          where: { productId: product.productId },
          data: { isActive: false },
        });
        results.push({ productCode, error: "product_inactive_or_limit_reached" });
        continue;
      }

      // Idempotency
      const existing = await prisma.affiliateUserSale.findUnique({
        where: { orderId_productId: { orderId, productId: product.productId } },
        select: { saleId: true },
      });
      if (existing) {
        results.push({ productCode, error: "duplicate_order" });
        continue;
      }

      // Komisyonlar
      const commissionAffiliate = Number(((amount * (product.commissionRate ?? 0)) / 100).toFixed(4));
      const commissionPlatform = Number(((amount * (PLATFORM_COMMISSION_RATE || 0)) / 100).toFixed(4));

      try {
        await prisma.$transaction([
          prisma.affiliateUserSale.create({
            data: {
              orderId,
              userId: link.userId,
              merchantId: integration.merchantId,
              productId: product.productId,
              amount,
              quantity,
              commissionAffiliate,
              commissionPlatform,
              status: "confirmed",
              convertedAt: new Date(),
              affiliateLinkId: link.linkId,
              webhookLogId: log.id,
            },
          }),
          // Yarış koşullarını azaltmak için increment kullan
          prisma.merchantProduct.update({
            where: { productId: product.productId },
            data: { totalPurchases: { increment: quantity } },
          }),
        ]);

        results.push({
          productCode,
          success: true,
          commissionAffiliate,
          commissionPlatform,
        });
      } catch (e) {
        // UNIQUE ihlali veya başka bir DB hatası
        results.push({ productCode, error: "db_error" });
      }
    }

    if (affiliateIdForLog) {
      await prisma.webhookRequestLog.update({
        where: { id: log.id },
        data: { affiliateId: affiliateIdForLog },
      });
    }

    return NextResponse.json(
      { success: true, logId: log.id, results },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // Son savunma: iç ayrıntıyı sızdırmadan generic hata
    console.error("purchase_callback fatal:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
