// app/api/purchase_callback/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Purchase webhook (merchant -> platform)
 * Security:
 * - HMAC-SHA256(timestamp + "." + rawBody) with per-merchant secret (MERCHANT_KEY_<keyId>)
 * - Timestamp window: ±5m
 * - Replay protection: unique (requestId, nonce)
 * - IP allowlist per MerchantIntegration
 * - Rate limit: IP+keyId
 * - Body size cap: 256KB
 * - Idempotency: unique (orderId, productId) in AffiliateUserSale
 * - Defensive product checks (active, sales limit)
 * - Comprehensive audit via WebhookRequestLog
 * - All responses: no-store + hardened headers
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

// ---- Config ----
const WINDOW_S = 5 * 60; // ±5 minutes
const MAX_BODY_BYTES = 256 * 1024;
const ALLOWED_STATUSES = new Set(["pending", "confirmed", "canceled"]);
const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? "0");

// ---- Helpers ----
function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}
function getIP(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
function ipAllowed(ip, allowlist) {
  if (!allowlist) return true;
  const list = allowlist.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(ip);
}
function resolveSecretForKeyId(keyId) {
  if (!keyId) return null;
  const envName = `MERCHANT_KEY_${keyId}`;
  return process.env[envName] || null;
}
function hexToUint8Array(hex) {
  const clean = String(hex || "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean)) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

// Node >=18 has WebCrypto
const cryptoApi = globalThis.crypto || (await import("crypto")).webcrypto;
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

// ---- GET optional health ----
export async function GET() {
  return withHeaders(
    NextResponse.json({ ok: true })
  );
}

// ---- POST webhook ----
export async function POST(req) {
  try {
    const ip = getIP(req);

    // Rate limit (IP + keyId)
    const rawKeyId = req.headers.get("x-key-id") || "-";
    const rlKey = makeRateLimitKey(req, { scope: "purchase_callback", extra: `${ip}:${rawKeyId}` });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 200, windowMs: 60_000 });
    if (!ok) {
      audit?.({ evt: "webhook.ratelimited", ip, keyId: rawKeyId });
      return withHeaders(
        NextResponse.json(
          { error: "too_many_requests" },
          { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
        )
      );
    }

    // Required headers
    const keyId = req.headers.get("x-key-id");
    const requestId = req.headers.get("x-request-id");
    const nonce = req.headers.get("x-nonce");
    const ts = req.headers.get("x-timestamp");
    const signature = req.headers.get("x-signature");
    const ua = req.headers.get("user-agent") || undefined;
    if (!keyId || !requestId || !nonce || !ts || !signature) {
      return withHeaders(
        NextResponse.json({ error: "missing_auth_headers" }, { status: 400 })
      );
    }

    // Lookup integration
    const integration = await prisma.merchantIntegration.findUnique({
      where: { keyId },
      select: { merchantId: true, isActive: true, webhookIpAllowlist: true /*, secretHash: true*/ },
    });
    if (!integration || !integration.isActive) {
      audit?.({ evt: "webhook.integration_inactive_or_missing", keyId });
      return withHeaders(
        NextResponse.json({ error: "unauthorized" }, { status: 401 })
      );
    }

    // IP allowlist
    if (!ipAllowed(ip, integration.webhookIpAllowlist || "")) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(Number(ts) * 1000 || Date.now()),
          hmac: signature, ip, ua,
          status: "unauthorized",
          error: "ip_not_allowed",
          rawBody: "",
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        },
      });
      return withHeaders(
        NextResponse.json({ error: "ip_not_allowed" }, { status: 403 })
      );
    }

    // Timestamp window
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > WINDOW_S) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(Number(ts) * 1000 || Date.now()),
          hmac: signature, ip, ua,
          status: "expired",
          error: "stale_or_invalid_timestamp",
          rawBody: "",
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        },
      });
      return withHeaders(
        NextResponse.json({ error: "stale_or_invalid_timestamp" }, { status: 400 })
      );
    }

    // Content-Length guard (if provided)
    const clen = Number(req.headers.get("content-length"));
    if (Number.isFinite(clen) && clen > MAX_BODY_BYTES) {
      return withHeaders(
        NextResponse.json({ error: "payload_too_large" }, { status: 413 })
      );
    }

    // Early replay detection
    const dup = await prisma.webhookRequestLog.findFirst({
      where: { OR: [{ requestId }, { nonce }] },
      select: { id: true },
    });
    if (dup) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature, ip, ua,
          status: "replay",
          error: "duplicate_requestId_or_nonce",
          rawBody: "",
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        },
      });
      return withHeaders(
        NextResponse.json({ error: "replay_detected" }, { status: 409 })
      );
    }

    // Read raw body (keep raw for HMAC)
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return withHeaders(
        NextResponse.json({ error: "payload_too_large" }, { status: 413 })
      );
    }

    // HMAC verify
    const secret = resolveSecretForKeyId(keyId);
    if (!secret) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature, ip, ua,
          status: "unauthorized",
          error: "secret_not_found_for_keyId",
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        },
      });
      return withHeaders(
        NextResponse.json({ error: "unauthorized" }, { status: 401 })
      );
    }

    // Optional: verify env secret hash against DB secretHash (if you store a hash in DB)
    // if (integration.secretHash?.startsWith("sha256:")) { ... }

    const valid = await hmacVerify(secret, tsNum, rawBody, signature);
    if (!valid) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature, ip, ua,
          status: "invalid_signature",
          error: null,
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        },
      });
      return withHeaders(
        NextResponse.json({ error: "invalid_signature" }, { status: 401 })
      );
    }

    // Parse JSON (after signature verification)
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature, ip, ua,
          status: "error",
          error: "invalid_json",
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        },
      });
      return withHeaders(
        NextResponse.json({ error: "invalid_json" }, { status: 400 })
      );
    }

    // Extract fields
    const { token, orderId, status } = body || {};
    const items = Array.isArray(body?.products)
      ? body.products
      : [{
          productCode: body?.productCode,
          quantity: body?.quantity,
          amount: body?.amount,
          currency: body?.currency,
        }];

    if (!token || !orderId || !status || !ALLOWED_STATUSES.has(String(status))) {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature, ip, ua,
          status: "error",
          error: "missing_or_invalid_fields",
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: body,
          itemsCount: Array.isArray(items) ? items.length : null,
        },
      });
      return withHeaders(
        NextResponse.json({ error: "missing_or_invalid_fields" }, { status: 400 })
      );
    }

    // Ignore anything but confirmed (but log as accepted/ignored)
    if (String(status) !== "confirmed") {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId: integration.merchantId,
          requestId, nonce,
          sentAt: new Date(tsNum * 1000),
          hmac: signature, ip, ua,
          status: "accepted",
          error: `ignored_status_${status}`,
          rawBody,
          headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
          parsedBody: body,
          itemsCount: Array.isArray(items) ? items.length : null,
        },
      });
      return withHeaders(
        NextResponse.json({ ok: true, message: `Order ${orderId} ignored (status=${status})` })
      );
    }

    // Create primary log row (accepted)
    const log = await prisma.webhookRequestLog.create({
      data: {
        merchantId: integration.merchantId,
        requestId, nonce,
        sentAt: new Date(tsNum * 1000),
        hmac: signature, ip, ua,
        status: "accepted",
        error: null,
        rawBody,
        headers: { keyId, requestId, nonce, timestamp: ts, signature, ip, ua },
        parsedBody: body,
        itemsCount: Array.isArray(items) ? items.length : null,
      },
      select: { id: true },
    });

    // Resolve base link (visible + not expired)
    const now = new Date();
    let linkBase = await prisma.affiliateLink.findFirst({
      where: { token, isVisible: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: {
        product: {
          select: {
            productId: true,
            merchantId: true,
            commissionRate: true,
            isActive: true,
            maxSalesLimit: true,
            totalPurchases: true,
          },
        },
      },
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

      // Product must belong to this merchant
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

      // Ensure link matches this product (fallback to specific lookup)
      let link = linkBase;
      if (!link || link.product.productId !== product.productId) {
        link = await prisma.affiliateLink.findFirst({
          where: {
            token,
            productId: product.productId,
            isVisible: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          include: {
            product: {
              select: {
                merchantId: true,
                commissionRate: true,
                maxSalesLimit: true,
                totalPurchases: true,
                isActive: true,
              },
            },
          },
        });
      }
      if (!link) {
        results.push({ productCode, error: "invalid_or_inactive_token" });
        continue;
      }
      affiliateIdForLog ||= link.userId;

      // Active + limit checks
      const projectedTotal = (product.totalPurchases ?? 0) + quantity;
      if (!product.isActive || (product.maxSalesLimit != null && projectedTotal > product.maxSalesLimit)) {
        // Close product defensively if limit exceeded
        await prisma.merchantProduct.update({
          where: { productId: product.productId },
          data: { isActive: false },
        });
        results.push({ productCode, error: "product_inactive_or_limit_reached" });
        continue;
      }

      // Idempotency per (orderId, productId)
      const existing = await prisma.affiliateUserSale.findUnique({
        where: { orderId_productId: { orderId, productId: product.productId } },
        select: { saleId: true },
      });
      if (existing) {
        results.push({ productCode, error: "duplicate_order" });
        continue;
      }

      // Commissions
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
          prisma.merchantProduct.update({
            where: { productId: product.productId },
            data: { totalPurchases: { increment: quantity } },
          }),
        ]);

        results.push({ productCode, success: true, commissionAffiliate, commissionPlatform });
      } catch (e) {
        results.push({ productCode, error: "db_error" });
      }
    }

    if (affiliateIdForLog) {
      await prisma.webhookRequestLog.update({
        where: { id: log.id },
        data: { affiliateId: affiliateIdForLog },
      });
    }

    return withHeaders(
      NextResponse.json({ success: true, logId: log.id, results })
    );
  } catch (err) {
    console.error("purchase_callback fatal:", err);
    audit?.({ evt: "webhook.fatal", error: (err?.message || String(err)).slice(0, 200) });
    return withHeaders(
      NextResponse.json({ error: "server_error" }, { status: 500 })
    );
  }
}
