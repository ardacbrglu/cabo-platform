import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

export async function GET() {
  try {
    // await ile cookies!
    const cookieStore = await cookies();
    const token = cookieStore.get('cabo_token')?.value;
    let userId = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.user_id;
      } catch (err) {
        console.log("JWT decode error:", err);
      }
    }

    // 1. Tüm aktif ve admin onaylı ürünleri çek
    let allProducts = await prisma.merchantProduct.findMany({
      where: {
        is_active: true,
        activated_by_admin: true,
      },
      orderBy: { created_at: 'desc' },
      select: {
        product_id: true,
        name: true,
        description: true,
        image_url: true,
        merchant_url: true,
        commission_rate: true,
        merchant_id: true,
        total_clicks: true,
        total_purchases: true,
        max_sales_limit: true,
        activated_by_admin: true,
        is_active: true,
      },
    });

    // Kota aşılmış ürünleri filtrele
    const products = allProducts.filter(
      p =>
        (p.max_sales_limit == null) ||
        (p.total_purchases < p.max_sales_limit)
    );

    // Kullanıcının affiliate_link'leri (aktif/pasif fark etmeksizin)
    let userLinks = [];
    let visibleLinkIds = [];
    if (userId) {
      userLinks = await prisma.affiliateLink.findMany({
        where: { user_id: userId },
        select: { product_id: true, token: true, is_visible: true, expires_at: true }
      });

      const activeProductIds = new Set(products.map(p => p.product_id));
      visibleLinkIds = userLinks
        .filter(link => link.is_visible && activeProductIds.has(link.product_id))
        .map(link => link.product_id);
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
