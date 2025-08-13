// app/api/purchase_callback/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

/**
 * SECURITY NOTES
 * - HMAC doğrulama: Her merchant için MerchantIntegration.keyId ile seçilen secret.
 * - Replay koruması: requestId / nonce UNIQUE; timestamp ±5dk penceresi.
 * - IP allowlist: MerchantIntegration.webhookIpAllowlist (basit eşleşme; CIDR için TODO).
 * - Rate limit: IP + keyId bazlı, kritik endpoint → ayrı scope/pencere.
 * - Loglama: WebhookRequestLog → rawBody, headers, parsedBody, status.
 * - Sale bağlama: Her ürün satırı ayrı AffiliateUserSale; hepsi webhookLogId ile log’a bağlanır.
 */

const WINDOW_S = 5 * 60; // ±5 dakika tolerans
const ALLOWED_STATUSES = ["pending", "confirmed", "canceled"];
const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? "0"); // % olarak

// --- Utilities ---
function getIP(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function hexToUint8Array(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function hmacVerify(secret, timestampSec, rawBody, signatureHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = enc.encode(`${timestampSec}.${rawBody}`);
  const sig = hexToUint8Array(String(signatureHex).toLowerCase());
  return crypto.subtle.verify("HMAC", key, sig, data);
}

// Basit IP allowlist kontrolü (virgülle ayrılmış listede birebir eşleşme). CIDR için geliştirme notu.
function ipAllowed(ip, allowlist) {
  if (!allowlist) return true;
  const list = allowlist
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length === 0 || list.includes(ip);
}

// SECRET çözümleyici (örnek): keyId → env değişkeni MERCHANT_KEY_<KEYID>
function resolveSecretForKeyId(keyId) {
  if (!keyId) return null;
  // Örn: keyId = "mrc_123" → env: MERCHANT_KEY_mrc_123
  const envName = `MERCHANT_KEY_${keyId}`;
  return process.env[envName] || null;
}

// --- Handlers ---
export async function GET() {
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req) {
  const ip = getIP(req);

  // Rate limit (IP + scope)
  const rlKey = makeRateLimitKey(req, { scope: "purchase_callback", extra: ip });
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
    return new NextResponse(JSON.stringify({ error: "Missing auth headers" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // Integration lookup (merchant başına key yönetimi)
  const integration = await prisma.merchantIntegration.findUnique({
    where: { keyId },
    select: { merchantId: true, isActive: true, webhookIpAllowlist: true },
  });
  if (!integration || !integration.isActive) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (!ipAllowed(ip, integration.webhookIpAllowlist || "")) {
    // IP allowlist dışı
    // Not: merchantId zorunlu olduğu için burada loglayabiliriz.
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
    return new NextResponse(JSON.stringify({ error: "IP not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
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
    return new NextResponse(JSON.stringify({ error: "Stale or invalid timestamp" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // Replay: requestId / nonce daha önce kullanıldı mı?
  const dup = await prisma.webhookRequestLog.findFirst({
    where: { OR: [{ requestId }, { nonce }] },
    select: { id: true },
  });
  if (dup) {
    return new NextResponse(JSON.stringify({ error: "Replay detected" }), {
      status: 409,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const rawBody = await req.text();

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
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

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
    return new NextResponse(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
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
    return new NextResponse(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
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
    return new NextResponse(JSON.stringify({ error: "Missing or invalid fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // Sadece confirmed işlem
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
    return new NextResponse(
      JSON.stringify({ ok: true, message: `Order ${orderId} ignored (status=${status})` }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }

  // Bu noktada: doğrulanmış ve confirmed. Log kaydını oluştur.
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

  // Token → AffiliateLink (productId eşleşmesi denenecek)
  // Not: Çok ürün varsa aynı token ile tüm ürünler beklenir.
  const linkBase = await prisma.affiliateLink.findFirst({
    where: { token, isVisible: true },
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

    // İlgili affiliate linki ürünle de doğrula (mümkünse)
    let link = linkBase;
    if (!link || link.product.productId !== product.productId) {
      link = await prisma.affiliateLink.findFirst({
        where: { token, productId: product.productId, isVisible: true },
        include: { product: { select: { merchantId: true, commissionRate: true, maxSalesLimit: true, totalPurchases: true, isActive: true } } },
      });
    }
    if (!link) {
      results.push({ productCode, error: "invalid_or_inactive_token" });
      continue;
    }
    affiliateIdForLog ||= link.userId; // ilk başarılı eşleşmede log'a yazacağız

    // Ürün limiti/aktiflik
    const projectedTotal = (product.totalPurchases ?? 0) + quantity;
    if (!product.isActive || (product.maxSalesLimit != null && projectedTotal > product.maxSalesLimit)) {
      // limit aşıldıysa ürünü pasifle
      await prisma.merchantProduct.update({
        where: { productId: product.productId },
        data: { isActive: false },
      });
      results.push({ productCode, error: "product_inactive_or_limit_reached" });
      continue;
    }

    // Idempotency: aynı (orderId, productId) daha önce işlendi mi?
    const existing = await prisma.affiliateUserSale.findUnique({
      where: {
        orderId_productId: { orderId, productId: product.productId },
      },
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
        prisma.merchantProduct.update({
          where: { productId: product.productId },
          data: { totalPurchases: projectedTotal },
        }),
      ]);

      results.push({
        productCode,
        success: true,
        commissionAffiliate,
        commissionPlatform,
      });
    } catch (e) {
      // Unique violation veya başka bir DB hatası
      results.push({ productCode, error: "db_error" });
    }
  }

  // Log'ta affiliateId'i setle (ilk başarılı satırdan)
  if (affiliateIdForLog) {
    await prisma.webhookRequestLog.update({
      where: { id: log.id },
      data: { affiliateId: affiliateIdForLog },
    });
  }

  return new NextResponse(JSON.stringify({ success: true, logId: log.id, results }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
