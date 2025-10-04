// app/api/purchase_callback/route.js

/**
 * SECURITY DOCBLOCK — Purchase Webhook (HMAC + Idempotency)
 * - HMAC-SHA256 doğrulama: ts.body ve kanonik JSON desteklenir, timingSafeEqual kullanılır.
 * - Timestamp toleransı: WEBHOOK_TS_TOLERANCE (default 300s).
 * - Body limit: WEBHOOK_MAX_BODY (default 256KB).
 * - Idempotency: x-request-id / x-idempotency-key / nonce ile tekrarlar engellenir.
 * - Product kapıları: isActive, activatedByAdmin, maxSalesLimit, merchant eşleşmesi.
 * - Token kapıları: link.isVisible && !expired.
 * - Platform komisyonu: **PlatformConfig.platform_commission_rate** canlı okunur; env fallback.
 * - Komisyon tabanı: **platform = (affiliate komisyonu × %platform)** (güncellendi).
 * - Tüm yanıtlar no-store; hatalı imzalar ve replay’ler kayıt altına alınır.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

const TOLERANCE_S = Number(process.env.WEBHOOK_TS_TOLERANCE ?? 300);
const MAX_BODY_BYTES = Number(process.env.WEBHOOK_MAX_BODY ?? 262144);
const REQUIRE_PRODUCT_CODE = String(process.env.REQUIRE_PRODUCT_CODE || "0") === "1";
const ALLOWED_STATUSES = new Set(["pending", "confirmed", "canceled"]);

const ok = (o = {}) =>
  new NextResponse(JSON.stringify({ ok: true, ...o }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const bad = (s, m, e) =>
  new NextResponse(JSON.stringify({ ok: false, error: m, ...(e || {}) }), {
    status: s,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const get = (req, keys) => {
  for (const k of keys) {
    const v = req.headers.get(k);
    if (v) return v;
  }
  return "";
};
const hexEq = (a, b) => {
  const A = Buffer.from(String(a || "").toLowerCase(), "hex");
  const B = Buffer.from(String(b || "").toLowerCase(), "hex");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
const round4 = (n) => Math.round(Number(n || 0) * 10000) / 10000;

/** "12", "12%", "0.12" -> yüzde değeri (0–100) */
function parsePercentTo0_100(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  if (s.endsWith("%")) s = s.slice(0, -1).trim();
  const num = Number(s);
  if (!Number.isFinite(num)) return null;
  const pct = num <= 1 ? num * 100 : num;
  return Math.max(0, Math.min(100, pct));
}

/** Kanonik JSON (imza doğrulamada 3. yol) */
function stableStringify(input) {
  const seen = new WeakSet();
  const normalize = (v) => {
    if (!v || typeof v !== "object") return v;
    if (seen.has(v)) return v;
    seen.add(v);
    if (Array.isArray(v)) return v.map(normalize);
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  };
  return JSON.stringify(normalize(input));
}

async function resolveMerchantId(keyId) {
  try {
    const integ = await prisma.merchantIntegration.findUnique({
      where: { keyId },
      select: { merchantId: true, isActive: true },
    });
    if (integ && integ.isActive) return integ.merchantId;
  } catch {}
  try {
    const map = JSON.parse(process.env.MERCHANT_ID_MAP_JSON || "{}");
    const v = map[keyId];
    if (Number.isFinite(Number(v))) return Number(v);
  } catch {}
  return null;
}

/** Platform komisyon yüzdesi (0–100). Öncelik: DB -> ENV -> 0 */
async function getPlatformCommissionPercent() {
  try {
    const row = await prisma.platformConfig.findUnique({
      where: { keyName: "platform_commission_rate" },
      select: { value: true },
    });
    const fromDb = parsePercentTo0_100(row?.value);
    if (fromDb != null) return fromDb;
  } catch {}
  const fromEnv = parsePercentTo0_100(process.env.PLATFORM_COMMISSION_RATE);
  if (fromEnv != null) return fromEnv;
  return 0;
}

export async function GET() {
  return ok({ healthy: true });
}

export async function POST(req) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  try {
    // --- Headers & TS
    const keyId = get(req, ["x-cabo-key-id", "x-key-id"]);
    const tsStr = get(req, ["x-cabo-timestamp", "x-timestamp"]);
    const sigRaw = get(req, ["x-cabo-signature", "x-signature"]);
    const sigCanonHdr = get(req, ["x-cabo-signature-canonical"]);
    let requestId = get(req, ["x-request-id", "x-idempotency-key"]);
    let nonce = get(req, ["x-nonce"]);

    if (!keyId || !tsStr || !sigRaw) return bad(400, "missing_auth_headers");
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S)
      return bad(400, "stale_or_invalid_timestamp");

    // --- Body (ham)
    const rawBody = await req.text();
    const clen = Number(req.headers.get("content-length"));
    if (
      !rawBody ||
      (Number.isFinite(clen) && clen > MAX_BODY_BYTES) ||
      rawBody.length > MAX_BODY_BYTES
    )
      return bad(413, "payload_too_large");

    // --- Secret
    const secretEnv = `MERCHANT_KEY_${String(keyId).replace(/[^A-Za-z0-9_]/g, "")}`;
    const secret = (process.env[secretEnv] || "").trim();
    if (!secret) return bad(401, "unauthorized", { reason: "secret_not_found_for_keyId" });

    // --- Signature candidates (3 yol)
    let parsed = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {}
    const wantRaw = crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
    const wantJson = parsed
      ? crypto.createHmac("sha256", secret).update(`${ts}.${JSON.stringify(parsed)}`).digest("hex")
      : "";
    const wantCanon = parsed
      ? crypto.createHmac("sha256", secret).update(`${ts}.${stableStringify(parsed)}`).digest("hex")
      : "";

    const sigOk =
      hexEq(wantRaw, sigRaw) ||
      (wantJson && hexEq(wantJson, sigRaw)) ||
      (sigCanonHdr && wantCanon && hexEq(wantCanon, sigCanonHdr));

    if (!sigOk) {
      try {
        const merchantId = await resolveMerchantId(keyId);
        const orderId = parsed
          ? String(parsed.orderId || parsed.orderNumber || "invalid_sig")
          : "invalid_sig";
        await prisma.webhookRequestLog.create({
          data: {
            merchantId: merchantId ?? 0,
            requestId: requestId || crypto.randomBytes(8).toString("hex"),
            nonce: nonce || crypto.randomBytes(8).toString("hex"),
            sentAt: new Date(ts * 1000),
            hmac: String(sigRaw),
            ip,
            ua,
            status: "invalid_signature",
            error: `got=${sigRaw} wantRaw=${wantRaw}${
              wantJson ? ` wantJson=${wantJson}` : ""
            }${wantCanon ? ` wantCanon=${wantCanon}` : ""}`,
            rawBody,
            headers: { keyId, ts, ip, ua, sigCanonHdr: sigCanonHdr || "" },
            orderId,
          },
        });
      } catch {}
      return bad(401, "invalid_signature");
    }

    // --- Parse garanti
    if (!parsed) {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return bad(400, "invalid_json");
      }
    }

    // --- Normalize payload
    const isNew = typeof parsed.orderNumber === "string" && Array.isArray(parsed.items);
    const orderId = String(parsed.orderId || parsed.orderNumber || "");
    const caboRef = parsed.caboRef || parsed.token || null;
    const status = String(parsed.status || "confirmed");
    if (!orderId || !ALLOWED_STATUSES.has(status))
      return bad(400, "missing_or_invalid_order_or_status");

    const items = [];
    if (isNew) {
      for (const it of parsed.items) {
        const q = Number(it?.quantity || 1);
        const unit = Number.isFinite(Number(it?.unitPriceCharged))
          ? Number(it.unitPriceCharged)
          : undefined;
        const lt = Number.isFinite(Number(it?.lineTotal))
          ? Number(it.lineTotal)
          : unit != null
          ? round4(unit * q)
          : NaN;
        items.push({
          productCode: it?.productCode,
          productId: it?.productId,
          productSlug: it?.productSlug,
          quantity: q,
          lineTotal: lt,
        });
      }
    } else {
      const arr = Array.isArray(parsed.products) ? parsed.products : [parsed];
      for (const it of arr) {
        const q = Number(it?.quantity || 1);
        const amt = Number(it?.amount);
        items.push({
          productCode: it?.productCode,
          quantity: q,
          lineTotal: Number.isFinite(amt) ? amt : NaN,
        });
      }
    }
    if (
      !items.length ||
      items.some((i) => !Number.isFinite(i.lineTotal) || i.lineTotal < 0 || i.quantity <= 0)
    )
      return bad(400, "invalid_items_payload");

    // --- Merchant
    const merchantId = await resolveMerchantId(keyId);
    if (merchantId == null) return bad(401, "unauthorized", { reason: "merchant_not_mapped" });

    // --- Idempotency
    requestId =
      requestId ||
      crypto
        .createHash("sha256")
        .update(`${keyId}|${ts}|${rawBody.slice(0, 256)}`)
        .digest("hex")
        .slice(0, 32);
    nonce =
      nonce ||
      crypto
        .createHash("sha256")
        .update(`${orderId}|${ts}`)
        .digest("hex")
        .slice(0, 32);

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

    // --- Non-confirmed => sadece logla
    if (status !== "confirmed") {
      await prisma.webhookRequestLog.create({
        data: {
          merchantId,
          requestId,
          nonce,
          sentAt: new Date(ts * 1000),
          hmac: String(sigRaw),
          ip,
          ua,
          status: "accepted",
          error: `ignored_status_${status}`,
          rawBody,
          headers: { keyId, ts, ip, ua },
          parsedBody: parsed,
          itemsCount: items.length,
          orderId,
        },
      });
      return ok({ message: `Order ${orderId} ignored (status=${status})` });
    }

    // --- Primary log
    const logRow = await prisma.webhookRequestLog.create({
      data: {
        merchantId,
        requestId,
        nonce,
        sentAt: new Date(ts * 1000),
        hmac: String(sigRaw),
        ip,
        ua,
        status: "accepted",
        error: null,
        rawBody,
        headers: { keyId, ts, ip, ua },
        parsedBody: parsed,
        itemsCount: items.length,
        orderId,
      },
      select: { id: true },
    });

    // --- Platform komisyon yüzdesi (0–100) **DB'den**
    const platformPct = await getPlatformCommissionPercent();

    // --- İşlem
    const now = new Date();
    let baseLink = null;
    if (caboRef) {
      baseLink = await prisma.affiliateLink.findFirst({
        where: { token: caboRef, isVisible: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
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
      });
    }

    const results = [];
    let affiliateIdForLog = null;

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
      }
      if (!mp && it.productId) {
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

      const qty = Number(it.quantity || 1);
      const projected = (mp.totalPurchases ?? 0) + qty;
      if (mp.maxSalesLimit != null && projected > mp.maxSalesLimit) {
        await prisma.merchantProduct.update({ where: { productId: mp.productId }, data: { isActive: false } });
        results.push({ product: it.productCode || it.productId || it.productSlug, error: "quota_exceeded" });
        continue;
      }

      let link = baseLink;
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
          const lu = await prisma.affiliateLink.findUnique({ where: { linkId: link.linkId }, select: { userId: true } });
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

      const lineTotal = Number(it.lineTotal);
      const commissionAffiliate = round4((lineTotal * Number(mp.commissionRate || 0)) / 100);
      // 🔁 GÜNCEL HESAP: Platform komisyonu, affiliate komisyonunun yüzdesi
      const commissionPlatform = round4((commissionAffiliate * platformPct) / 100);

      try {
        await prisma.$transaction([
          prisma.affiliateUserSale.create({
            data: {
              orderId,
              userId: link.userId,
              merchantId,
              productId: mp.productId,
              amount: lineTotal,
              quantity: qty,
              commissionAffiliate,
              commissionPlatform, // <-- affiliate komisyonu baz alınarak
              status: "confirmed",
              convertedAt: new Date(),
              affiliateLinkId: link.linkId,
              webhookLogId: logRow.id,
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
          platformPctUsed: platformPct,
          platformBase: "affiliate_commission", // debug için bilgi
        });
      } catch {
        results.push({ product: it.productCode || it.productId || it.productSlug, error: "db_error" });
      }
    }

    if (affiliateIdForLog != null) {
      try {
        await prisma.webhookRequestLog.update({
          where: { id: logRow.id },
          data: { affiliateId: affiliateIdForLog },
        });
      } catch {}
    }

    return ok({ keyId, orderId, processed: results });
  } catch {
    return bad(500, "unhandled_error");
  }
}
