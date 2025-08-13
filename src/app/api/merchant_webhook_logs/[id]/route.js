// app/api/merchant_webhook_logs/[id]/route.js
export const dynamic = "force-dynamic";

/**
 * SECURITY NOTES
 * - Auth: NextAuth session şart.
 * - RBAC: Sadece role === "merchant" ve kendi log’una erişim.
 * - Rate limit: userId + scope ile 30/dk.
 * - Data minimization: rawBody/headers gibi hassas alanlar DÖNMEZ.
 * - Cache: no-store.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireRole } from "@/lib/access";

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function GET(req, { params }) {
  try {
    // 1) Session + RBAC
    const session = await getServerSession(authOptions);
    const user = session?.user || null;
    try {
      requireRole(user, "merchant");
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Rate limit (30/dk)
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
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
      );
    }

    // 3) Param doğrulama
    const logId = parseInt(params?.id || "", 10);
    if (!Number.isFinite(logId) || logId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // 4) Log + ilişkili sales (yalnızca kendi merchant'ı)
    const log = await prisma.webhookRequestLog.findFirst({
      where: { id: logId, merchantId: Number(user.id) },
      select: {
        id: true,
        requestId: true,
        nonce: true,
        sentAt: true,
        receivedAt: true,
        status: true,
        parsedBody: true, // JSON (orderId, currency, products[...])
        sales: {
          select: {
            status: true,
            amount: true,               // varsayım: unit price
            quantity: true,
            commissionAffiliate: true,
            merchantProduct: {
              select: { productId: true, name: true, productCode: true },
            },
          },
        },
      },
    });

    if (!log) {
      return NextResponse.json({ error: "Log not found" }, { status: 404 });
    }

    // 5) parsedBody'den item’ları toparla
    const body = log.parsedBody && typeof log.parsedBody === "object" ? log.parsedBody : {};
    const orderId = body?.orderId || null;
    const currency = body?.currency || null;
    const rawProducts = Array.isArray(body?.products)
      ? body.products
      : (body?.productCode
          ? [{ productCode: body.productCode, quantity: body.quantity, amount: body.amount }]
          : []);

    // 6) accepted sales’ı productCode -> sale map'ine çevir
    const saleByCode = new Map();
    for (const s of log.sales || []) {
      const code = s?.merchantProduct?.productCode || null;
      if (!code) continue;
      // confirmed ise öncelik veriyoruz
      if (!saleByCode.has(code) || s.status === "confirmed") {
        saleByCode.set(code, s);
      }
    }

    // 7) Ürün adlarını doldurmak için, sale bulunmayan kodlar için DB'den isim çek
    const missingCodes = [];
    for (const it of rawProducts) {
      const code = String(it?.productCode || "").trim();
      if (!code) continue;
      if (!saleByCode.has(code)) missingCodes.push(code);
    }
    let nameByCode = {};
    if (missingCodes.length) {
      const products = await prisma.merchantProduct.findMany({
        where: {
          merchantId: Number(user.id),
          productCode: { in: Array.from(new Set(missingCodes)) },
        },
        select: { productCode: true, name: true },
      });
      nameByCode = Object.fromEntries(products.map(p => [p.productCode, p.name]));
    }

    // 8) Detay satırlarını inşa et
    const items = [];
    let acceptedTotal = 0;
    let acceptedCommission = 0;

    for (const it of rawProducts) {
      const productCode = String(it?.productCode || "").trim();
      const quantity = toNum(it?.quantity, 1);
      const unitPrice = toNum(it?.amount, 0); // amount = unit price varsayımı
      const lineTotal = unitPrice * quantity;

      const sale = productCode ? saleByCode.get(productCode) : null;
      const accepted = !!(sale && sale.status === "confirmed");
      const productName =
        (sale && sale.merchantProduct?.name) ||
        nameByCode[productCode] ||
        undefined;
      const commission = accepted ? toNum(sale?.commissionAffiliate, 0) : undefined;

      if (accepted) {
        acceptedTotal += lineTotal;
        acceptedCommission += toNum(commission, 0);
      }

      items.push({
        productCode,
        productName,
        quantity,
        unitPrice,
        lineTotal,
        accepted,
        commission,
      });
    }

    return NextResponse.json(
      {
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
      },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
    );
  } catch (err) {
    console.error("GET /api/merchant_webhook_logs/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
