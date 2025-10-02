export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

const TOLERANCE_S = Number(process.env.WEBHOOK_TS_TOLERANCE ?? 300);
const MAX_BODY_BYTES = Number(process.env.WEBHOOK_MAX_BODY ?? 262144);
const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0);
const REQUIRE_PRODUCT_CODE = String(process.env.REQUIRE_PRODUCT_CODE || "0") === "1";
const ALLOWED_STATUSES = new Set(["pending", "confirmed", "canceled"]);

const ok  = (o={}) => new NextResponse(JSON.stringify({ ok:true, ...o }), { status:200, headers:{ "Content-Type":"application/json","Cache-Control":"no-store" }});
const bad = (s,m,e) => new NextResponse(JSON.stringify({ ok:false, error:m, ...(e||{}) }), { status:s, headers:{ "Content-Type":"application/json","Cache-Control":"no-store" }});

function hmacHex(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}
function hexEq(a,b) {
  const A = Buffer.from(String(a||"").toLowerCase(), "hex");
  const B = Buffer.from(String(b||"").toLowerCase(), "hex");
  return A.length === B.length && crypto.timingSafeEqual(A,B);
}
function round4(n){ return Math.round(Number(n||0)*10000)/10000; }
function getHeader(req, keys){ for (const k of keys){ const v=req.headers.get(k); if (v) return v; } return null; }

async function resolveMerchantId(keyId){
  try{
    const integ = await prisma.merchantIntegration.findUnique({ where:{ keyId }, select:{ merchantId:true, isActive:true }});
    if (integ && integ.isActive) return integ.merchantId;
  }catch{}
  try{
    const map = JSON.parse(process.env.MERCHANT_ID_MAP_JSON || "{}");
    const v = map[keyId];
    if (Number.isFinite(Number(v))) return Number(v);
  }catch{}
  return null;
}

async function hasColumn(table, column){
  try {
    const rows = await prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, column);
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

export async function GET() { return ok({ healthy:true }); }

export async function POST(req){
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  try {
    // ---- Headers & body
    const keyId = getHeader(req, ["x-cabo-key-id","x-key-id"]) || "";
    const tsStr = getHeader(req, ["x-cabo-timestamp","x-timestamp"]) || "";
    const sig   = getHeader(req, ["x-cabo-signature","x-signature"]) || "";
    const sigRawHeader = req.headers.get("x-cabo-signature-raw") || null; // isteğe bağlı, shop tarafı da yollar
    let requestId = getHeader(req, ["x-request-id","x-idempotency-key"]) || "";
    let nonce     = getHeader(req, ["x-nonce"]) || "";

    if (!keyId || !tsStr || !sig) return bad(400, "missing_auth_headers");
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || Math.abs(Date.now()/1000 - ts) > TOLERANCE_S) {
      return bad(400, "stale_or_invalid_timestamp");
    }

    const rawBody = await req.text();
    const clen = Number(req.headers.get("content-length"));
    if (!rawBody || (Number.isFinite(clen) && clen > MAX_BODY_BYTES) || rawBody.length > MAX_BODY_BYTES) {
      return bad(413, "payload_too_large");
    }

    // ---- Secret & HMAC: v2(ts.body) VE v1(body-only) kabul
    const secretEnv = `MERCHANT_KEY_${String(keyId).replace(/[^A-Za-z0-9_]/g,"")}`;
    const secret = process.env[secretEnv];
    if (!secret) return bad(401, "unauthorized", { reason:"secret_not_found_for_keyId" });

    const calcTsBody = hmacHex(secret, `${ts}.${rawBody}`);
    const calcRaw    = hmacHex(secret, rawBody);
    const sigOk = hexEq(calcTsBody, sig) || hexEq(calcRaw, sig) || (sigRawHeader && hexEq(calcRaw, sigRawHeader));

    if (!sigOk) {
      // Minimal log – imza neden tutmadı görmek için
      try {
        const merchantId = await resolveMerchantId(keyId);
        const canOrderId = await hasColumn("webhookRequestLogs","orderId");
        await prisma.webhookRequestLog.create({
          data:{
            merchantId,
            merchant: merchantId ? { connect:{ id: merchantId } } : undefined,
            requestId: requestId || crypto.createHash("sha256").update(`${keyId}|${ts}|${rawBody.slice(0,256)}`).digest("hex").slice(0,32),
            nonce:     nonce     || crypto.createHash("sha256").update(`nonce|${ts}|${Date.now()}`).digest("hex").slice(0,32),
            sentAt: new Date(ts*1000),
            hmac: String(sig),
            ip, ua,
            status: "invalid_signature",
            error: JSON.stringify({ why:"hmac_mismatch", have:sig, calcTsBody, calcRaw, hasRawHdr: !!sigRawHeader }).slice(0,500),
            rawBody,
            headers: { keyId, ts, ip, ua },
            ...(canOrderId ? { orderId: "invalid_sig" } : {})
          }
        });
      }catch{}
      return bad(401, "invalid_signature");
    }

    // ---- Parse & normalize
    let parsed; try { parsed = JSON.parse(rawBody); } catch { return bad(400, "invalid_json"); }

    const isNew   = typeof parsed.orderNumber === "string" && Array.isArray(parsed.items);
    const orderId = String(parsed.orderId || parsed.orderNumber || "");
    const caboRef = parsed.caboRef || parsed.token || null;
    const status  = String(parsed.status || "confirmed");
    if (!orderId || !ALLOWED_STATUSES.has(status)) return bad(400, "missing_or_invalid_order_or_status");

    const items = [];
    if (isNew) {
      for (const it of parsed.items) {
        const q = Number(it?.quantity || 1);
        const unit = Number.isFinite(Number(it?.unitPriceCharged)) ? Number(it.unitPriceCharged) : undefined;
        const lt = Number.isFinite(Number(it?.lineTotal)) ? Number(it.lineTotal) : (unit!=null ? round4(unit*q) : NaN);
        items.push({ productCode: it?.productCode, productId: it?.productId, productSlug: it?.productSlug, quantity:q, lineTotal:lt });
      }
    } else {
      const arr = Array.isArray(parsed.products) ? parsed.products : [parsed];
      for (const it of arr) {
        const q = Number(it?.quantity || 1);
        const amt = Number(it?.amount);
        items.push({ productCode: it?.productCode, quantity:q, lineTotal: Number.isFinite(amt) ? amt : NaN });
      }
    }
    if (!items.length || items.some(i => !Number.isFinite(i.lineTotal) || i.lineTotal < 0 || i.quantity <= 0)) {
      return bad(400, "invalid_items_payload");
    }

    const merchantId = await resolveMerchantId(keyId);
    if (merchantId == null) return bad(401, "unauthorized", { reason:"merchant_not_mapped" });

    requestId = requestId || crypto.createHash("sha256").update(`${keyId}|${orderId}|${rawBody.slice(0,64)}`).digest("hex").slice(0,32);
    nonce     = nonce     || crypto.createHash("sha256").update(`${orderId}|${ts}`).digest("hex").slice(0,32);

    const dup = await prisma.webhookRequestLog.findFirst({ where:{ OR:[{requestId},{nonce}] }, select:{id:true} });
    if (dup) {
      await prisma.webhookRequestLog.update({ where:{id:dup.id}, data:{ status:"replay", error:"duplicate_requestId_or_nonce" }});
      return bad(409, "replay_detected");
    }

    const canOrderId = await hasColumn("webhookRequestLogs","orderId");
    // Ön log
    const logRow = await prisma.webhookRequestLog.create({
      data:{
        merchantId, merchant:{ connect:{ id: merchantId } },
        requestId, nonce, sentAt:new Date(ts*1000),
        hmac: String(sig), ip, ua,
        status:"accepted", error: null,
        rawBody, headers:{ keyId, ts, ip, ua },
        parsedBody: parsed, itemsCount: items.length,
        ...(canOrderId ? { orderId } : {})
      },
      select:{ id:true }
    });

    // İşle
    const now = new Date();
    let baseLink = null;
    if (caboRef) {
      baseLink = await prisma.affiliateLink.findFirst({
        where:{ token:caboRef, isVisible:true, OR:[{expiresAt:null},{expiresAt:{gt:now}}] },
        include:{ product:{ select:{ productId:true, merchantId:true, commissionRate:true, isActive:true, maxSalesLimit:true, totalPurchases:true, activatedByAdmin:true } } },
        orderBy:{ linkId:"desc" }
      });
    }

    const results = [];
    let affiliateIdForLog = null;

    for (const it of items) {
      if (REQUIRE_PRODUCT_CODE && !it.productCode) { results.push({ productCode:null, error:"product_code_required" }); continue; }

      let mp = null;
      if (it.productCode) {
        mp = await prisma.merchantProduct.findFirst({ where:{ productCode: it.productCode }, select:{ productId:true, merchantId:true, isActive:true, maxSalesLimit:true, totalPurchases:true, commissionRate:true, activatedByAdmin:true }});
      } else if (it.productId) {
        mp = await prisma.merchantProduct.findFirst({ where:{ productId: it.productId }, select:{ productId:true, merchantId:true, isActive:true, maxSalesLimit:true, totalPurchases:true, commissionRate:true, activatedByAdmin:true }});
      }
      if (!mp) { results.push({ product: it.productCode || it.productId || it.productSlug || null, error:"product_not_found" }); continue; }
      if (mp.merchantId !== merchantId) { results.push({ product: it.productCode || it.productId || it.productSlug, error:"merchant_mismatch" }); continue; }
      if (mp.activatedByAdmin === false || !mp.isActive) { results.push({ product: it.productCode || it.productId || it.productSlug, error:"inactive_or_unapproved" }); continue; }

      const qty = Number(it.quantity || 1);
      const projected = (mp.totalPurchases ?? 0) + qty;
      if (mp.maxSalesLimit != null && projected > mp.maxSalesLimit) {
        await prisma.merchantProduct.update({ where:{ productId: mp.productId }, data:{ isActive:false } });
        results.push({ product: it.productCode || it.productId || it.productSlug, error:"quota_exceeded" });
        continue;
      }

      let link = baseLink;
      if (!link || link.product.productId !== mp.productId) {
        link = caboRef ? await prisma.affiliateLink.findFirst({
          where:{ token:caboRef, productId: mp.productId, isVisible:true, OR:[{expiresAt:null},{expiresAt:{gt:now}}] },
          include:{ product:{ select:{ merchantId:true, commissionRate:true, maxSalesLimit:true, totalPurchases:true, isActive:true, activatedByAdmin:true } } },
          orderBy:{ linkId:"desc" }
        }) : null;
      }
      if (!link) { results.push({ product: it.productCode || it.productId || it.productSlug, error:"invalid_or_inactive_token" }); continue; }

      if (affiliateIdForLog == null) {
        if (link.userId == null) {
          const lu = await prisma.affiliateLink.findUnique({ where:{ linkId: link.linkId }, select:{ userId:true } });
          link.userId = lu?.userId ?? null;
        }
        affiliateIdForLog = link.userId ?? null;
      }

      const exists = await prisma.affiliateUserSale.findUnique({ where:{ orderId_productId:{ orderId, productId: mp.productId } }, select:{ saleId:true }});
      if (exists) { results.push({ product: it.productCode || it.productId || it.productSlug, error:"duplicate_order" }); continue; }

      const lineTotal = Number(it.lineTotal);
      const commissionAffiliate = round4(lineTotal * Number(mp.commissionRate || 0) / 100);
      const commissionPlatform  = round4(lineTotal * PLATFORM_COMMISSION_RATE / 100);

      try {
        await prisma.$transaction([
          prisma.affiliateUserSale.create({
            data:{
              orderId, userId: link.userId, merchantId, productId: mp.productId,
              amount: lineTotal, quantity: qty,
              commissionAffiliate, commissionPlatform,
              status:"confirmed", convertedAt: new Date(),
              affiliateLinkId: link.linkId, webhookLogId: logRow.id
            }
          }),
          prisma.merchantProduct.update({
            where:{ productId: mp.productId },
            data:{ totalPurchases: (mp.totalPurchases ?? 0) + qty, ...(mp.maxSalesLimit != null && projected >= mp.maxSalesLimit ? { isActive:false } : {}) }
          })
        ]);
        results.push({ product: it.productCode || it.productId || it.productSlug, status:"accepted", commissionAffiliate, commissionPlatform });
      } catch {
        results.push({ product: it.productCode || it.productId || it.productSlug, error:"db_error" });
      }
    }

    if (affiliateIdForLog != null) {
      try { await prisma.webhookRequestLog.update({ where:{ id: logRow.id }, data:{ affiliateId: affiliateIdForLog } }); } catch {}
    }

    return ok({ keyId, orderId, processed: results });
  } catch {
    return bad(500, "unhandled_error");
  }
}
