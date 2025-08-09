// app/api/merchant/payout/details/route.js
export const dynamic = "force-dynamic";

/**
 * SECURITY NOTES (read me):
 * - Auth: NextAuth session zorunlu; custom JWT yok.
 * - RBAC: Sadece role==="merchant" erişir.
 * - CSRF: Header(cookie) eşleşmesi zorunlu (x-csrf-token <-> csrf_token).
 * - Rate limit: userId + scope anahtarı ile 10/dk.
 * - PII/Secrets: affiliateLink.token gibi gizli alanlar DÖNMEZ.
 * - Validation: Zod ile katı şema; itemIds max 100.
 * - ORM: Sorgular merchantId === session.user.id ile kısıtlanır.
 * - Caching: no-store.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";

const requestSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1).max(100),
});

export async function POST(req) {
  try {
    // 1) CSRF (header + cookie)
    await validateCsrfToken(req);

    // 2) Session & RBAC
    const session = await getServerSession(authOptions);
    const user = session?.user;
    if (!user?.id || user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) Rate limit (10 req/dk - user scoped)
    const rlKey = makeRateLimitKey(req, { scope: "merchant-payout-details", userId: user.id });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 4) Input validation
    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const { itemIds } = parsed.data;

    // 5) İlgili merchant’a ait payout item’larını çek (sadece güvenli alanlar)
    const items = await prisma.payoutRequestItem.findMany({
      where: {
        itemId: { in: itemIds },
        merchantId: user.id,
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
          },
        },
      },
    });

    if (!items.length) {
      return NextResponse.json({ error: "No payout items found" }, { status: 404 });
    }

    // 6) Her item’ın ilişkili satışlarını topla (salt okunur; gizli alan yok)
    const sales = [];
    for (const item of items) {
      if (!item.sourceSaleIds) continue;

      const saleIds = item.sourceSaleIds
        .split(",")
        .map((id) => Number(id))
        .filter((n) => Number.isInteger(n) && n > 0);

      if (!saleIds.length) continue;

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
          // DİKKAT: affiliateLinkId alıyoruz ama link.token DÖNMEYİZ.
          affiliateLinkId: true,
        },
      });

      // affiliateLink.token SIZDIRMA! (gerekirse sadece var/yok bayrağı)
      for (const sale of salesData) {
        sales.push({
          ...sale,
          itemId: item.itemId,
          payout_status: item.status,
          requested_at: item.payoutRequest?.requestedAt || null,
          has_affiliate_link: Boolean(sale.affiliateLinkId),
        });
      }
    }

    // 7) Ürün adlarını map’le (sadece name)
    const productIds = [...new Set(sales.map((s) => s.productId).filter(Boolean))];
    const products = productIds.length
      ? await prisma.merchantProduct.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true, name: true },
        })
      : [];
    const productMap = Object.fromEntries(products.map((p) => [p.productId, p.name]));

    // 8) Meta (tek request üst bilgisi gibi)
    const meta = {
      status: items[0]?.status || "",
      total: items.reduce((sum, i) => sum + Number(i.amount || 0), 0),
      requestDate: items[0]?.payoutRequest?.requestedAt?.toISOString?.() || "",
      affiliate_name: items[0]?.payoutRequest?.realUserFullname || "",
    };

    // 9) Frontend’e sade, güvenli detaylar
    const details = sales.map((s) => ({
      orderId: s.orderId,
      product_name: productMap[s.productId] || "",
      amount: Number(s.amount || 0),
      commission: Number(s.commissionAffiliate || 0),
      quantity: s.quantity ?? 0,
      sale_date: s.convertedAt
        ? new Date(s.convertedAt).toISOString().slice(0, 19).replace("T", " ")
        : "-",
      status: s.status || "-",
      // Gizli token yerine bayrak:
      has_affiliate_link: s.has_affiliate_link,
    }));

    return NextResponse.json(
      {
        details,
        affiliate_name: meta.affiliate_name,
        meta,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          Vary: "Cookie",
        },
      }
    );
  } catch (err) {
    // Prod’da PII loglama yok; generic hata
    console.error("POST /merchant/payout/details error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
