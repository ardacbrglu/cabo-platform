import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import { z } from "zod";

const requestSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1),
});

export async function POST(req) {
  try {
    // CSRF koruması
    await validateCsrfToken(req);

    // Auth & Rate Limit
    const token = getTokenFromRequest(req);
    const user = token ? verifyToken(token) : null;
    if (!user || user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await checkRateLimit(req, user.userId, 10, 60_000, 'merchant-payout-details');

    // Input validation (zod)
    const body = await req.json();
    const { itemIds } = requestSchema.parse(body);

    // Sadece merchant’a ait payout item'larını çek
    const items = await prisma.payoutRequestItem.findMany({
      where: {
        itemId: { in: itemIds },
        merchantId: user.userId,
      },
      select: {
        itemId: true,
        amount: true,
        productId: true,
        sourceSaleIds: true,
        status: true,
        payoutRequest: {
          select: {
            userId: true,
            realUserFullname: true,
            requestedAt: true,
          }
        }
      }
    });

    if (!items.length) {
      return NextResponse.json({ error: "No payout items found" }, { status: 404 });
    }

    // Her payout item için ilgili satışları topla
    let sales = [];
    for (const item of items) {
      if (item.sourceSaleIds) {
        const saleIds = item.sourceSaleIds.split(',').map(id => Number(id)).filter(Boolean);
        const salesData = await prisma.affiliateUserSale.findMany({
          where: { saleId: { in: saleIds } },
          select: {
            saleId: true,
            orderId: true,
            amount: true,
            commissionAffiliate: true,
            quantity: true,
            status: true,
            convertedAt: true,
            productId: true,
            affiliateLinkId: true,
          },
        });
        // affiliateLinkId’den token çek
        for (const sale of salesData) {
          let saleToken = null;
          if (sale.affiliateLinkId) {
            const link = await prisma.affiliateLink.findUnique({
              where: { linkId: sale.affiliateLinkId },
              select: { token: true }
            });
            saleToken = link?.token || "";
          }
          sales.push({
            ...sale,
            itemId: item.itemId,
            payout_status: item.status,
            requested_at: item.payoutRequest?.requestedAt,
            token: saleToken,
          });
        }
      }
    }

    // Ürün isimlerini map’le
    const productIds = [...new Set(sales.map(s => s.productId))];
    const products = productIds.length
      ? await prisma.merchantProduct.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true, name: true }
        })
      : [];
    const productMap = Object.fromEntries(products.map(p => [p.productId, p.name]));

    // Meta bilgileri (modal üstündeki bilgiler için)
    const meta = {
      status: items[0]?.status || "",
      total: items.reduce((sum, i) => sum + Number(i.amount), 0),
      requestDate: items[0]?.payoutRequest?.requestedAt?.toISOString() || "",
      affiliate_name: items[0]?.payoutRequest?.realUserFullname || "",
    };

    // Sale detaylarını frontende hazırla
    const details = sales.map(s => ({
      orderId: s.orderId,
      product_name: productMap[s.productId] || "",
      amount: Number(s.amount),
      commission: Number(s.commissionAffiliate),
      quantity: s.quantity,
      sale_date: s.convertedAt? new Date(s.convertedAt).toISOString().slice(0, 19).replace('T', ' '): "-",
      status: s.status || "-",   // Sale status
      token: s.token || "",
    }));

    return NextResponse.json({
      details,
      affiliate_name: meta.affiliate_name,
      meta,
    });

  } catch (err) {
    console.error("Merchant Payment Details Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
