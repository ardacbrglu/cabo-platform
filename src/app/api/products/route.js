export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // << yolu kendi projenle uyumlu tut

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET(req) {
  try {
    // --- Rate limit (IP bazlı 30/dk)
    const rlKey = makeRateLimitKey(req, { scope: "products_list" });
    const { ok, resetMs } = await checkRateLimit({
      key: rlKey,
      limit: 30,
      windowMs: 60_000,
    });
    if (!ok) {
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // --- Opsiyonel kullanıcı (NextAuth session)
    const session = await getServerSession(authOptions);
    let userId = session?.user?.id ?? null;

    // Bazı kurulumlardaki callback'lerde id gelmeyebilir → email'den id bulun
    if (!userId && session?.user?.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.user.email.toLowerCase() },
        select: { id: true },
      });
      userId = u?.id ?? null;
    }

    // --- Ürünler (aktif + admin onaylı)
    const allProducts = await prisma.merchantProduct.findMany({
      where: { isActive: true, activatedByAdmin: true },
      orderBy: { createdAt: "desc" },
      select: {
        productId: true,
        name: true,
        description: true,
        imageUrl: true,
        merchantUrl: true,
        commissionRate: true,
        merchantId: true,
        totalClicks: true,
        totalPurchases: true,
        maxSalesLimit: true,
        activatedByAdmin: true,
        isActive: true,
        price: true,
      },
    });

    // Kota aşılmışları ele
    const products = allProducts.filter(
      (p) => p.maxSalesLimit == null || p.totalPurchases < p.maxSalesLimit
    );

    // --- Kullanıcının linkleri (opsiyonel bilgi)
    let userLinks = [];
    let visibleLinkIds = [];
    if (userId) {
      userLinks = await prisma.affiliateLink.findMany({
        where: { userId },
        select: { productId: true, token: true, isVisible: true, expiresAt: true },
      });
      const activeIds = new Set(products.map((p) => p.productId));
      visibleLinkIds = userLinks
        .filter((l) => l.isVisible && activeIds.has(l.productId))
        .map((l) => l.productId);
    }

    return json({ products, userLinks, visibleLinkIds });
  } catch (err) {
    console.error("API /api/products error:", err);
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
}
