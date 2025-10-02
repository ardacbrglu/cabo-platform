export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";
import crypto from "crypto";

// ---- Config
const TOLERANCE_S = Number.isFinite(Number(process.env.WEBHOOK_TS_TOLERANCE))
  ? Number(process.env.WEBHOOK_TS_TOLERANCE)
  : 300;
const MAX_BODY_BYTES = Number.isFinite(Number(process.env.WEBHOOK_MAX_BODY))
  ? Number(process.env.WEBHOOK_MAX_BODY)
  : 256 * 1024;
const RATE_LIMIT_PER_MIN = 200;
const ALLOWED_STATUSES = new Set(["pending", "confirmed", "canceled"]);
const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? "0");
const REQUIRE_PRODUCT_CODE = String(process.env.REQUIRE_PRODUCT_CODE || "0") === "1";

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
function ipAllowed(ip, csv) {
  if (!csv) return true;
  const list = csv
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length === 0 || list.includes(ip);
}
function normalizeKeyIdForEnv(keyId) {
  return keyId.replace(/[^A-Za-z0-9_]/g, "");
}
function resolveSecretForKeyId(keyId) {
  if (!keyId) return null;
  const env = `MERCHANT_KEY_${normalizeKeyIdForEnv(keyId)}`;
  return process.env[env] || null;
}
function hexEqual(aHex, bHex) {
  const a = Buffer.from(String(aHex || "").toLowerCase(), "hex");
  const b = Buffer.from(String(bHex || "").toLowerCase(), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function computeHmac(secret, ts, raw) {
  return crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
}
function bad(status, msg, extra) {
  return withHeaders(
    new NextResponse(
      JSON.stringify({ ok: false, error: msg, ...(extra || {}) }),
      { status, headers: { "Content-Type": "application/json" } },
    ),
  );
}
function ok(obj) {
  return withHeaders(
    new NextResponse(JSON.stringify({ ok: true, ...(obj || {}) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
function getHeader(req, keys) {
  for (const k of keys) {
    const v = req.headers.get(k);
    if (v) return v;
  }
  return null;
}
const round4 = (n) => Math.round(n * 10000) / 10000;

// Log (replay-safe)
async function logOnce(base) {
  const requestId = base?.requestId;
  const nonce = base?.nonce;
  if (requestId || nonce) {
    const ex = await prisma.webhookRequestLog.findFirst({
      where: { OR: [{ requestId }, { nonce }] },
      select: { id: true },
    });
    if (ex) return prisma.webhookRequestLog.update({ where: { id: ex.id }, data: base });
  }
  return prisma.webhookRequestLog.create({ data: base });
}

// Header allowlist
const ALLOWED_KEY_IDS = (process.env.WEBHOOK_ALLOWED_KEY_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Fallback keyId->merchantId map
function loadMerchantMap() {
  try {
    return JSON.parse(process.env.MERCHANT_ID_MAP_JSON || "{}");
  } catch {
    return {};
  }
}
const MERCHANT_MAP = loadMerchantMap();

export async function GET() {
  return ok({ healthy: true });
}

export async function POST(req) {
  const ip = getIP(req);

  // Rate-limit
  const rawKeyId = getHeader(req, ["x-cabo-key-id", "x-key-id"]) || "-";
  const rlKey = makeRateLimitKey(req, { scope: "purchase_callback", extra: `${ip}:${rawKeyId}` });
  const rl = await checkRateLimit({ key: rlKey, limit: RATE_LIMIT_PER_MIN, windowMs: 60_000 });
  if (!rl.ok) {
    audit?.({ evt: "webhook.ratelimited", ip, keyId: rawKeyId });
    return withHeaders(
      NextResponse.json(
        { error: "too_many_requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetMs || 0) / 1000)) } },
      ),
    );
  }

  // Headers
  const keyId = getHeader(req, ["x-cabo-key-id", "x-key-id"]) || "";
  const ts = getHeader(req, ["x-cabo-timestamp", "x-timestamp"]) || "";
  const signature = getHeader(req, ["x-cabo-signature", "x-signature"]) || "";
  let requestId = getHeader(req, ["x-request-id", "x-idempotency-key"]) || "";
  let nonce = getHeader(req, ["x-nonce"]) || "";
  const ua = req.headers.get("user-agent") || undefined;

  if (!keyId || !ts || !signature) return bad(400, "missing_auth_headers");
  if (ALLOWED_KEY_IDS.length && !ALLOWED_KEY_IDS.includes(keyId)) return bad(401, "keyid_not_allowed");

  // Integration lookup (preferred) or ENV map
  let integration = null;
  try {
    integration = await prisma.merchantIntegration.findUnique({
      where: { keyId },
      select: { merchantId: true, isActive: true, webhookIpAllowlist: true },
    });
  } catch {}

  const merchantId =
    (integration && integration.merchantId) ||
    (typeof MERCHANT_MAP[keyId] === "number" ? MERCHANT_MAP[keyId] : null);

  if (!merchantId || (integration && !integration.isActive)) {
    audit?.({ evt: "webhook.integration_missing_or_inactive", keyId });
    return bad(401, "unauthorized");
  }

  // IP allowlist
  if (integration && !ipAllowed(ip, integration.webhookIpAllowlist || "")) {
    await logOnce({
      merchantId,
      requestId: requestId || null,
      nonce: nonce || null,
      sentAt: new Date(),
      hmac: String(signature),
      ip,
      ua,
      status: "unauthorized",
      error: "ip_not_allowed",
      rawBody: "",
      headers: { keyId, ip, ua },
    });
    return bad(403, "ip_not_allowed");
  }

  // Timestamp window
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > TOLERANCE_S) {
    await logOnce({
      merchantId,
      requestId: requestId || null,
      nonce: nonce || null,
      sentAt: new Date(Number.isFinite(tsNum) ? tsNum * 1000 : Date.now()),
      hmac: String(signature),
      ip,
      ua,
      status: "expired",
      error: "stale_or_invalid_timestamp",
      rawBody: "",
      headers: { keyId, ts, ip, ua },
    });
    return bad(400, "stale_or_invalid_timestamp");
  }

  // Size guard + raw
  const clen = Number(req.headers.get("content-length"));
  if (Number.isFinite(clen) && clen > MAX_BODY_BYTES) return bad(413, "payload_too_large");
  const rawBody = await req.text();
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) return bad(413, "payload_too_large");

  // HMAC
  const secret = resolveSecretForKeyId(keyId);
  if (!secret) {
    await logOnce({
      merchantId,
      requestId: requestId || null,
      nonce: nonce || null,
      sentAt: new Date(tsNum * 1000),
      hmac: String(signature),
      ip,
      ua,
      status: "unauthorized",
      error: "secret_not_found_for_keyId",
      rawBody,
      headers: { keyId, ts, ip, ua },
    });
    return bad(401, "unauthorized");
  }
  const expected = computeHmac(secret, tsNum, rawBody);
  if (!hexEqual(expected, signature)) {
    await logOnce({
      merchantId,
      requestId: requestId || null,
      nonce: nonce || null,
      sentAt: new Date(tsNum * 1000),
      hmac: String(signature),
      ip,
      ua,
      status: "invalid_signature",
      error: null,
      rawBody,
      headers: { keyId, ts, ip, ua },
    });
    return bad(401, "invalid_signature");
  }

  // Parse
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    await logOnce({
      merchantId,
      requestId: requestId || null,
      nonce: nonce || null,
      sentAt: new Date(tsNum * 1000),
      hmac: String(signature),
      ip,
      ua,
      status: "error",
      error: "invalid_json",
      rawBody,
      headers: { keyId, ts, ip, ua },
    });
    return bad(400, "invalid_json");
  }

  // Normalize payload
  const isNew = typeof parsed.orderNumber === "string" && Array.isArray(parsed.items);
  const orderId = (parsed.orderId || parsed.orderNumber || "").toString();
  const caboRef = parsed.caboRef || parsed.token || null;
  const status = (parsed.status || "confirmed").toString();
  if (!orderId || !ALLOWED_STATUSES.has(status)) return bad(400, "missing_or_invalid_order_or_status");

  const items = [];
  if (isNew) {
    for (const it of parsed.items) {
      const q = Number(it?.quantity || 1);
      const unit = Number.isFinite(Number(it?.unitPriceCharged)) ? Number(it.unitPriceCharged) : undefined;
      const lt = Number.isFinite(Number(it?.lineTotal)) ? Number(it.lineTotal) : unit != null ? round4(unit * q) : NaN;
      items.push({
        productCode: it?.productCode || undefined,
        productId: it?.productId || undefined,
        productSlug: it?.productSlug || undefined,
        quantity: q,
        unitPriceCharged: unit,
        lineTotal: lt,
      });
    }
  } else {
    const arr = Array.isArray(parsed.products) ? parsed.products : [parsed];
    for (const it of arr) {
      const q = Number(it?.quantity || 1);
      const amt = Number(it?.amount);
      items.push({
        productCode: it?.productCode || undefined,
        quantity: q,
        lineTotal: Number.isFinite(amt) ? amt : NaN,
      });
    }
  }
  if (!items.length || items.some((i) => !Number.isFinite(i.lineTotal) || i.lineTotal < 0 || i.quantity <= 0)) {
    return bad(400, "invalid_items_payload");
  }

  // Deterministic ids if missing
  if (!requestId) {
    const sigBase = `${keyId}|${orderId}|${items
      .map((i) => i.productCode || i.productId || i.productSlug || "?")
      .join(",")}`;
    requestId = crypto.createHash("sha256").update(sigBase).digest("hex").slice(0, 32);
  }
  if (!nonce) nonce = crypto.createHash("sha256").update(`${orderId}|${ts}`).digest("hex").slice(0, 32);

  // Early replay
  const dup = await prisma.webhookRequestLog.findFirst({
    where: { OR: [{ requestId }, { nonce }] },
    select: { id: true },
  });
  if (dup) {
    await prisma.webhookRequestLog.update({
      where: { id: dup.id },
      data: { status: "replay", error: "duplicate_requestId_or_nonce", headers: { keyId, ts, ip, ua } },
    });
    return bad(409, "replay_detected");
  }

  // Non-confirmed -> accept+ignore
  if (status !== "confirmed") {
    await logOnce({
      merchantId,
      requestId,
      nonce,
      sentAt: new Date(tsNum * 1000),
      hmac: String(signature),
      ip,
      ua,
      status: "accepted",
      error: `ignored_status_${status}`,
      rawBody,
      headers: { keyId, ts, ip, ua },
      parsedBody: parsed,
      itemsCount: items.length,
      orderId, // <-- LOG’A ORDERID YAZ
    });
    return ok({ message: `Order ${orderId} ignored (status=${status})` });
  }

  // Primary log (orderId dahil)
  const logRow = await prisma.webhookRequestLog.create({
    data: {
      merchantId,
      requestId,
      nonce,
      sentAt: new Date(tsNum * 1000),
      hmac: String(signature),
      ip,
      ua,
      status: "accepted",
      error: null,
      rawBody,
      headers: { keyId, ts, ip, ua },
      parsedBody: parsed,
      itemsCount: items.length,
      orderId, // <-- burada da var
    },
    select: { id: true },
  });

  // Process items
  const now = new Date();
  const results = [];
  let affiliateIdForLog = null;

  const linkBase = caboRef
    ? await prisma.affiliateLink.findFirst({
        where: {
          token: caboRef,
          isVisible: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          product: { isActive: true },
        },
        include: {
          product: {
            select: {
              productId: true,
              merchantId: true,
              commissionRate: true,
              isActive: true,
              maxSalesLimit: true,
              totalPurchases: true,
              activatedByAdmin: true,
            },
          },
        },
        orderBy: { linkId: "desc" },
      })
    : null;

  for (const it of items) {
    if (REQUIRE_PRODUCT_CODE && !it.productCode) {
      results.push({ productCode: null, error: "product_code_required" });
      continue;
    }

    let mp = null;
    if (it.productCode) {
      mp = await prisma.merchantProduct.findFirst({
        where: { productCode: it.productCode },
        select: {
          productId: true,
          merchantId: true,
          isActive: true,
          maxSalesLimit: true,
          totalPurchases: true,
          commissionRate: true,
          activatedByAdmin: true,
        },
      });
    } else if (it.productId) {
      mp = await prisma.merchantProduct.findFirst({
        where: { productId: it.productId },
        select: {
          productId: true,
          merchantId: true,
          isActive: true,
          maxSalesLimit: true,
          totalPurchases: true,
          commissionRate: true,
          activatedByAdmin: true,
        },
      });
    }
    if (!mp) {
      results.push({ product: it.productCode || it.productId || it.productSlug || null, error: "product_not_found" });
      continue;
    }
    if (mp.merchantId !== merchantId) {
      results.push({ product: it.productCode || it.productId || it.productSlug, error: "merchant_mismatch" });
      continue;
    }
    if (mp.activatedByAdmin === false || !mp.isActive) {
      results.push({ product: it.productCode || it.productId || it.productSlug, error: "inactive_or_unapproved" });
      continue;
    }

    const qty = it.quantity || 1;
    const projected = (mp.totalPurchases ?? 0) + qty;
    if (mp.maxSalesLimit != null && projected > mp.maxSalesLimit) {
      await prisma.merchantProduct.update({
        where: { productId: mp.productId },
        data: { isActive: false },
      });
      results.push({ product: it.productCode || it.productId || it.productSlug, error: "quota_exceeded" });
      continue;
    }

    let link = linkBase;
    if (!link || link.product.productId !== mp.productId) {
      link = caboRef
        ? await prisma.affiliateLink.findFirst({
            where: {
              token: caboRef,
              productId: mp.productId,
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
                  activatedByAdmin: true,
                },
              },
            },
            orderBy: { linkId: "desc" },
          })
        : null;
    }
    if (!link) {
      results.push({ product: it.productCode || it.productId || it.productSlug, error: "invalid_or_inactive_token" });
      continue;
    }

    if (affiliateIdForLog == null) {
      if (link.userId == null) {
        const lu = await prisma.affiliateLink.findUnique({
          where: { linkId: link.linkId },
          select: { userId: true },
        });
        link.userId = lu?.userId ?? null;
      }
      affiliateIdForLog = link.userId ?? null;
    }

    const exists = await prisma.affiliateUserSale.findUnique({
      where: { orderId_productId: { orderId, productId: mp.productId } },
      select: { saleId: true },
    });
    if (exists) {
      results.push({ product: it.productCode || it.productId || it.productSlug, error: "duplicate_order" });
      continue;
    }

    const lineTotal = it.lineTotal;
    const commissionAffiliate = round4(((lineTotal || 0) * (Number(mp.commissionRate) || 0)) / 100);
    const commissionPlatform = round4(((lineTotal || 0) * (PLATFORM_COMMISSION_RATE || 0)) / 100);

    try {
      await prisma.$transaction([
        prisma.affiliateUserSale.create({
          data: {
            orderId, // AffiliateUserSale.orderId
            userId: link.userId,
            merchantId,
            productId: mp.productId,
            amount: lineTotal,
            quantity: qty,
            commissionAffiliate,
            commissionPlatform,
            status: "confirmed",
            convertedAt: new Date(),
            affiliateLinkId: link.linkId,
            webhookLogId: logRow.id, // ilişki
          },
        }),
        prisma.merchantProduct.update({
          where: { productId: mp.productId },
          data: {
            totalPurchases: (mp.totalPurchases ?? 0) + qty,
            ...(mp.maxSalesLimit != null && projected >= mp.maxSalesLimit ? { isActive: false } : {}),
          },
        }),
      ]);

      results.push({
        product: it.productCode || it.productId || it.productSlug,
        status: "accepted",
        commissionAffiliate,
        commissionPlatform,
      });
    } catch (e) {
      results.push({ product: it.productCode || it.productId || it.productSlug, error: "db_error" });
    }
  }

  if (affiliateIdForLog != null) {
    await prisma.webhookRequestLog.update({
      where: { id: logRow.id },
      data: { affiliateId: affiliateIdForLog },
    });
  }

  return ok({ keyId, orderId, processed: results });
}
