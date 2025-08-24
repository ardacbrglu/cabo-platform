// app/api/merchant_webhook_logs/[id]/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SECURITY
 * - Auth: NextAuth session zorunlu
 * - RBAC: role === "merchant", yalnızca kendi kaydı
 * - Ratelimit: userId scoped, 30 req/min
 * - Data minimization: ham header/raw body dönülmez
 * - Cache: no-store
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireRole } from "@/lib/authz";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export async function GET(req, { params }) {
  try {
    // 1) Auth + RBAC
    const session = await getServerSession(authOptions);
    const user = session?.user || null;
    try {
      requireRole(user, "merchant");
    } catch {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Ratelimit
    const rlKey = makeRateLimitKey(req, {
      scope: "merchant-webhook-log-detail",
      userId: user.id,
    });
    const { ok, resetMs } = await checkRateLimit({
      key: rlKey,
      limit: 30,
      windowMs: 60_000,
    });
    if (!ok) {
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
      );
    }

    // 3) Param doğrulama
    const logId = parseInt(params?.id || "", 10);
    if (!Number.isFinite(logId) || logId <= 0) {
      return json({ error: "Invalid id" }, { status: 400 });
    }

    // 4) Log + ilişkili satışlar (yalnızca kendi merchant'ı)
    const log = await prisma.webhookRequestLog.findFirst({
      where: { id: logId, merchantId: Number(user.id) },
      select: {
        id: true,
        requestId: true,
        nonce: true,
        sentAt: true,
        receivedAt: true,
        status: true,
        parsedBody: true, // JSON: { orderId, currency, products: [...] } veya { productCode, quantity, amount }
        sales: {
          select: {
            status: true,
            amount: true,                // unit price
            quantity: true,
            commissionAffiliate: true,
            merchantProduct: {
              select: { productId: true, name: true, productCode: true },
            },
          },
        },
      },
    });

    if (!log) return json({ error: "Log not found" }, { status: 404 });

    // 5) parsedBody → ürün satırları (backward compatible)
    const body = log.parsedBody && typeof log.parsedBody === "object" ? log.parsedBody : {};
    const orderId = body?.orderId || null;
    const currency = body?.currency || null;

    const rawProducts =
      Array.isArray(body?.products)
        ? body.products
        : (body?.productCode
            ? [{ productCode: body.productCode, quantity: body.quantity, amount: body.amount }]
            : []);

    // 6) confirmed satışları productCode → sale map
    const saleByCode = new Map();
    for (const s of log.sales || []) {
      const code = s?.merchantProduct?.productCode || null;
      if (!code) continue;
      if (!saleByCode.has(code) || s.status === "confirmed") {
        saleByCode.set(code, s);
      }
    }

    // 7) Satırı oluştururken isim gerektiğinde fallback için isim map'i topla
    const missingCodes = [];
    for (const it of rawProducts) {
      const code = String(it?.productCode || "").trim();
      if (code && !saleByCode.has(code)) missingCodes.push(code);
    }

    let nameByCode = {};
    if (missingCodes.length) {
      const products = await prisma.merchantProduct.findMany({
        where: { merchantId: Number(user.id), productCode: { in: Array.from(new Set(missingCodes)) } },
        select: { productCode: true, name: true },
      });
      nameByCode = Object.fromEntries(products.map((p) => [p.productCode, p.name]));
    }

    // 8) Detay satırları + toplamlar
    const items = [];

    let acceptedTotal = 0;
    let acceptedCommission = 0;

    for (const it of rawProducts) {
      const productCode = String(it?.productCode || "").trim();
      if (!productCode) continue;

      const quantity = toNum(it?.quantity, 1);
      const unitPrice = toNum(it?.amount, 0);
      const lineTotal = unitPrice * quantity;

      const sale = saleByCode.get(productCode);
      const accepted = !!(sale && sale.status === "confirmed");
      const productName = (sale && sale.merchantProduct?.name) || nameByCode[productCode] || undefined;
      const commission = accepted ? toNum(sale?.commissionAffiliate, 0) : undefined;

      if (accepted) {
        acceptedTotal += lineTotal;
        acceptedCommission += toNum(commission, 0);
      }

      items.push({ productCode, productName, quantity, unitPrice, lineTotal, accepted, commission });
    }

    return json({
      id: log.id,
      requestId: log.requestId,
      nonce: log.nonce,
      orderId,
      currency,
      sentAt: log.sentAt ? new Date(log.sentAt).toISOString() : null,
      receivedAt: log.receivedAt ? new Date(log.receivedAt).toISOString() : null,
      status: log.status,
      items,
      sums: {
        acceptedTotal,
        acceptedCommission,
      },
    });
  } catch (e) {
    console.error("GET /api/merchant_webhook_logs/[id] error:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
