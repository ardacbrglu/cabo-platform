// app/api/mylinks/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PURPOSE: Kullanıcının My Links listesini okuma (GET) ve bir linki gizleme (POST)
// SECURITY: NextAuth (auth()), CSRF (POST), rate limit (GET/POST), generic error mesajları

import { NextResponse } from "next/server";
import { auth } from "@/lib/authz";
import prisma from "@/lib/prisma";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

/**
 * KOTA KONTROLÜ:
 * Ürün max satış limitine ulaşmışsa ürünü kapatır (idempotent).
 * SECURITY NOTE: Sadece backend tarafında çağrılır.
 */
async function checkAndDeactivateProduct(product) {
  if (!product) return product;

  const max = typeof product.max_sales_limit === "number" ? product.max_sales_limit : null;
  const total = typeof product.total_purchases === "number" ? product.total_purchases : null;

  if (product.isActive && max !== null && total !== null && total >= max) {
    await prisma.merchantProduct.update({
      where: { productId: product.productId },
      data: { isActive: false },
    });
    return { ...product, isActive: false };
  }
  return product;
}

/**
 * GET /api/mylinks
 * Kullanıcının görünür ve süresi dolmamış linklerini (expiresAt NULL **veya** gelecekte),
 * ürün ve kullanıcıya özel istatistiklerle döner.
 */
export async function GET(req) {
  try {
    // Auth (NextAuth v5)
    const session = await auth();
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (role !== "affiliate") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Rate limit
    const rlKey = makeRateLimitKey(req, { scope: "my-links:get", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // Data (expiresAt NULL da kabul edilsin → non-expiring)
    const now = new Date();
    const links = await prisma.affiliateLink.findMany({
      where: {
        userId,
        isVisible: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      include: {
        product: {
          select: {
            productId: true,
            isActive: true,
            name: true,
            description: true,
            image_url: true,
            price: true,
            commissionRate: true,
            totalClicks: true,
            total_purchases: true,
            max_sales_limit: true,
            productCode: true,
            activated_by_admin: true,
          },
        },
      },
    });

    // Kalan satış kotası + idempotent kapatma
    const linksWithQuota = await Promise.all(
      links.map(async (link) => {
        const p = link.product;
        let remaining_sales = null;
        if (p && typeof p.max_sales_limit === "number" && typeof p.total_purchases === "number") {
          remaining_sales = Math.max(0, p.max_sales_limit - p.total_purchases);
        }

        const maybeClosed = p
          ? await checkAndDeactivateProduct({
              productId: p.productId,
              isActive: p.isActive,
              max_sales_limit: p.max_sales_limit,
              total_purchases: p.total_purchases,
            })
          : null;

        return {
          ...link,
          product: maybeClosed ? { ...p, ...maybeClosed, remaining_sales } : p,
        };
      })
    );

    // Kullanıcıya özel click/satış/kazanç istatistikleri
    const enrichedLinks = await Promise.all(
      linksWithQuota.map(async (link) => {
        const user_click_count = await prisma.click.count({
          where: { linkId: link.linkId },
        });

        // Şemanızdaki alan adı buysa kalsın; bazı şemalarda affiliateLinkId olabilir.
        const salesAgg = await prisma.affiliateUserSale.aggregate({
          _sum: { commissionAffiliate: true, quantity: true },
          where: { affiliate_linkId: link.linkId, userId },
        });

        return {
          ...link,
          user_click_count,
          user_sales_count: Number(salesAgg._sum.quantity) || 0,
          user_earnings: Number(salesAgg._sum.commissionAffiliate) || 0,
        };
      })
    );

    return NextResponse.json(
      { links: enrichedLinks },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
    );
  } catch (err) {
    console.error("GET /api/mylinks error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/mylinks
 * Body: { token: string }
 * Etki: İlgili linki kullanıcının “My Links” görünümünden kaldırır (isVisible = false).
 * NOTE: Silmiyor, sadece görünürlüğü kapatıyor.
 */
export async function POST(req) {
  try {
    // Auth
    const session = await auth();
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (role !== "affiliate") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // CSRF (mutating)
    validateCsrfToken(req);

    // Rate limit
    const rlKey = makeRateLimitKey(req, { scope: "my-links:hide", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const linkToken = body?.token;
    if (!linkToken || typeof linkToken !== "string") {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const updated = await prisma.affiliateLink.updateMany({
      where: { token: linkToken, userId, isVisible: true },
      data: { isVisible: false },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Link not found or already hidden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("POST /api/mylinks error:", err);
    // CSRF dahil tüm hatalar generic döndürülür
    return NextResponse.json({ error: "Failed to update link" }, { status: 500 });
  }
}
