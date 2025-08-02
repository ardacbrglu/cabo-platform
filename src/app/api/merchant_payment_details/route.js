import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";
import { z } from "zod";

const requestSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1),
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
    await checkRateLimit(req, user.user_id, 10, 60_000, 'merchant-payout-details');

    // Input validation (zod)
    const body = await req.json();
    const { item_ids } = requestSchema.parse(body);

    // Sadece merchant’a ait payout item'larını çek
    const items = await prisma.payout_request_items.findMany({
      where: {
        item_id: { in: item_ids },
        merchant_id: user.user_id,
      },
      select: {
        item_id: true,
        amount: true,
        product_id: true,
        source_sale_ids: true,
        status: true,
        payout_requests: {
          select: {
            user_id: true,
            real_user_fullname: true,
            requested_at: true,
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
      if (item.source_sale_ids) {
        const saleIds = item.source_sale_ids.split(',').map(id => Number(id)).filter(Boolean);
        const salesData = await prisma.affiliate_user_sales.findMany({
          where: { sale_id: { in: saleIds } },
          select: {
            sale_id: true,
            order_id: true,
            amount: true,
            commission_affiliate: true,
            quantity: true,
            status: true,
            converted_at: true,
            product_id: true,
            affiliate_link_id: true,
          },
        });
        // affiliate_link_id’den token çek
        for (const sale of salesData) {
          let saleToken = null;
          if (sale.affiliate_link_id) {
            const link = await prisma.affiliate_links.findUnique({
              where: { link_id: sale.affiliate_link_id },
              select: { token: true }
            });
            saleToken = link?.token || "";
          }
          sales.push({
            ...sale,
            item_id: item.item_id,
            payout_status: item.status,
            requested_at: item.payout_requests?.requested_at,
            token: saleToken,
          });
        }
      }
    }

    // Ürün isimlerini map’le
    const productIds = [...new Set(sales.map(s => s.product_id))];
    const products = productIds.length
      ? await prisma.merchantProduct.findMany({
          where: { product_id: { in: productIds } },
          select: { product_id: true, name: true }
        })
      : [];
    const productMap = Object.fromEntries(products.map(p => [p.product_id, p.name]));

    // Meta bilgileri (modal üstündeki bilgiler için)
    const meta = {
      status: items[0]?.status || "",
      total: items.reduce((sum, i) => sum + Number(i.amount), 0),
      requestDate: items[0]?.payout_requests?.requested_at?.toISOString() || "",
      affiliate_name: items[0]?.payout_requests?.real_user_fullname || "",
    };

    // Sale detaylarını frontende hazırla
    const details = sales.map(s => ({
      order_id: s.order_id,
      product_name: productMap[s.product_id] || "",
      amount: Number(s.amount),
      commission: Number(s.commission_affiliate),
      quantity: s.quantity,
      sale_date: s.converted_at
        ? new Date(s.converted_at).toISOString().slice(0, 19).replace('T', ' ')
        : "-",
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
