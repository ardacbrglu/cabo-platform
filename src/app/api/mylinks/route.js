import { cookies } from 'next/headers';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

// Kullanıcı kimliğini JWT'den çeker
async function getUserIdFromToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get('cabo_token')?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.user_id || null;
  } catch {
    return null;
  }
}

// Kalan komisyon hakkı otomatik kontrol ve ürün kapama
async function checkAndDeactivateProduct(product) {
  if (
    product &&
    typeof product.max_sales_limit === "number" &&
    typeof product.total_purchases === "number" &&
    product.is_active &&
    product.max_sales_limit !== null &&
    product.total_purchases >= product.max_sales_limit
  ) {
    await prisma.merchantProduct.update({
      where: { product_id: product.product_id },
      data: { is_active: false }
    });
    return { ...product, is_active: false };
  }
  return product;
}

export async function GET() {
  const userId = await getUserIdFromToken();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const links = await prisma.affiliateLink.findMany({
      where: {
        user_id: userId,
        is_visible: true,
        expires_at: { gt: new Date() }
      },
      include: {
        product: {
          select: {
            product_id: true,
            is_active: true,
            name: true,
            description: true,
            image_url: true,
            price: true,
            commission_rate: true,
            total_clicks: true,
            total_purchases: true,
            max_sales_limit: true,
            product_code: true,
            activated_by_admin: true
          }
        }
      }
    });

    // Her ürün için kalan satış hakkı hesapla ve gerekiyorsa kapat
    const linksWithQuota = await Promise.all(
      links.map(async link => {
        const p = link.product;
        let remaining_sales = null;
        if (p && typeof p.max_sales_limit === "number" && typeof p.total_purchases === "number") {
          remaining_sales = Math.max(0, p.max_sales_limit - p.total_purchases);
        }
        // Komisyon hakkı bitti mi? Ürünü otomatik kapat
        let productWithDeactivation = p;
        if (
          p &&
          typeof p.max_sales_limit === "number" &&
          typeof p.total_purchases === "number" &&
          p.is_active &&
          p.max_sales_limit !== null &&
          p.total_purchases >= p.max_sales_limit
        ) {
          productWithDeactivation = await checkAndDeactivateProduct({ ...p, remaining_sales });
        } else if (p) {
          productWithDeactivation = { ...p, remaining_sales };
        }
        return {
          ...link,
          product: productWithDeactivation
        };
      })
    );

    // Kullanıcıya özel click ve satış/kazanç
    const enrichedLinks = await Promise.all(
      linksWithQuota.map(async link => {
        // Kullanıcıya özel toplam click sayısı
        const userClickCount = await prisma.click.count({
          where: { link_id: link.link_id }
        });

        // 🔴🔴🔴 DÜZELTİLEN KISIM: Model adı affiliateUserSale olmalı!
        const salesAgg = await prisma.affiliateUserSale.aggregate({
          _sum: { commission_affiliate: true, quantity: true },
          where: {
            affiliate_link_id: link.link_id,   // doğru alan adı!
            user_id: userId
          }
        });

        return {
          ...link,
          user_click_count: userClickCount,
          user_sales_count: Number(salesAgg._sum.quantity) || 0,
          user_earnings: Number(salesAgg._sum.commission_affiliate) || 0
        };
      })
    );

    return Response.json({ links: enrichedLinks });
  } catch (err) {
    console.error("Failed to fetch links:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// === POST: Linki MyLinks'ten kaldır (is_visible = false)
export async function POST(req) {
  const userId = await getUserIdFromToken();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { token: linkToken } = body;

    if (!linkToken)
      return Response.json({ error: "Missing token" }, { status: 400 });

    const updated = await prisma.affiliateLink.updateMany({
      where: {
        token: linkToken,
        user_id: userId,
        is_visible: true
      },
      data: { is_visible: false }
    });

    if (updated.count === 0) {
      return Response.json({ error: "Link not found or already hidden" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Error hiding link:", err);
    return Response.json({ error: "Failed to update link" }, { status: 500 });
  }
}
