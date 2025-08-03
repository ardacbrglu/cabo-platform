import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

export async function GET() {
  try {
    // Kullanıcı JWT'si ile kimlik belirleme (opsiyonel)
    const cookieStore = await cookies();
    const token = cookieStore.get('cabo_token')?.value;
    let userId = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
      } catch (err) {
        console.log("JWT decode error:", err);
      }
    }

    // 1. Tüm aktif ve admin onaylı ürünleri çek
    let allProducts = await prisma.merchantProduct.findMany({
      where: {
        isActive: true,
        activatedByAdmin: true,
      },
      orderBy: { createdAt: 'desc' },
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
      },
    });

    // Kota aşılmış ürünleri filtrele
    const products = allProducts.filter(
      p =>
        (p.maxSalesLimit == null) ||
        (p.totalPurchases < p.maxSalesLimit)
    );

    // Kullanıcının affiliateLink'leri (aktif/pasif fark etmeksizin)
    let userLinks = [];
    let visibleLinkIds = [];
    if (userId) {
      userLinks = await prisma.affiliateLink.findMany({
        where: { userId: userId },
        select: { productId: true, token: true, isVisible: true, expiresAt: true }
      });

      const activeProductIds = new Set(products.map(p => p.productId));
      visibleLinkIds = userLinks
        .filter(link => link.isVisible && activeProductIds.has(link.productId))
        .map(link => link.productId);
    }

    return NextResponse.json({
      products,
      userLinks,
      visibleLinkIds
    });

  } catch (err) {
    console.error("API /api/products error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
