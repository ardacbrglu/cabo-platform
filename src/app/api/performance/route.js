import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
// import { checkRateLimit } from "@/lib/ratelimit"; // Eğer aktifse açabilirsin

const isValidDate = str => !isNaN(Date.parse(str));
const isValidIdArray = arr => Array.isArray(arr) && arr.every(Number.isInteger);

export async function GET(req) {
  try {
    // 1. Rate limit (opsiyonel)
    // await checkRateLimit(req, { window: 60, max: 20 });

    // 2. Auth
    const token = getTokenFromRequest(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.user_id;

    // 3. Query params + VALIDATION
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || null;
    const endDate = searchParams.get("endDate") || null;
    let productIds = searchParams.get("productIds")
      ? searchParams.get("productIds").split(",").map(Number)
      : [];

    // Tarih ve ürün ID validation
    if (startDate && !isValidDate(startDate)) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    if (endDate && !isValidDate(endDate)) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }
    if (productIds.length && !isValidIdArray(productIds)) {
      return NextResponse.json({ error: "Invalid productIds" }, { status: 400 });
    }

    // 4. Kullanıcının aktif affiliate ürünleri
    const userLinks = await prisma.affiliateLink.findMany({
      where: { user_id: userId, is_visible: true },
      select: { product_id: true }
    });
    const allProductIds = [...new Set(userLinks.map(l => l.product_id))];
    if (allProductIds.length === 0) {
      return NextResponse.json({
        products: [],
        totalClicks: 0,
        totalSales: 0,
        totalEarnings: 0,
        clickRecords: [],
        saleRecords: [],
        confirmedSales: [],
        allConfirmedSales: [],
      });
    }

    // Tüm aktif ürünlerin bilgilerini al
    const activeProducts = await prisma.merchantProduct.findMany({
      where: { product_id: { in: allProductIds }, is_active: true },
      select: { product_id: true, name: true, image_url: true }
    });

    // Seçili ürün filtrelemesi
    let filteredProductIds = activeProducts.map(p => p.product_id);
    if (productIds.length > 0 && !productIds.includes(0)) {
      filteredProductIds = filteredProductIds.filter(id => productIds.includes(id));
    }

    // 5. Tarih filtresi hazırla
    let dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate + "T23:59:59.999Z");

    // 6. Click kayıtları (her gün için)
    const clickRecordsRaw = await prisma.click.findMany({
      where: {
        affiliate_link: {
          user_id: userId,
          product_id: { in: filteredProductIds }
        },
        ...(startDate || endDate ? { clicked_at: dateFilter } : {})
      },
      select: {
        clicked_at: true,
        affiliate_link: { select: { product_id: true } }
      }
    });
    const clickRecords = clickRecordsRaw.map(r => ({
      date: r.clicked_at.toISOString().slice(0, 10),
      product_id: r.affiliate_link.product_id
    }));

    // 7. Satış kayıtları (quantity destekli!)
    const saleRecordsRaw = await prisma.affiliate_user_sales.findMany({
      where: {
        user_id: userId,
        product_id: { in: filteredProductIds },
        ...(startDate || endDate ? { converted_at: dateFilter } : {}),
      },
      select: {
        converted_at: true,
        product_id: true,
        quantity: true // <--- Quantity çekiliyor!
      }
    });
    // quantity null ise 1 alınır (default)
    const saleRecords = saleRecordsRaw.map(r => ({
      date: r.converted_at.toISOString().slice(0, 10),
      product_id: r.product_id,
      quantity: typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 1
    }));

    // 8. Confirmed Sales listesi (quantity ile!)
    const confirmedSalesRaw = await prisma.affiliate_user_sales.findMany({
      where: {
        user_id: userId,
        product_id: { in: filteredProductIds },
        status: "confirmed",
        ...(startDate || endDate ? { converted_at: dateFilter } : {}),
      },
      orderBy: { converted_at: "desc" },
      select: {
        sale_id: true,
        amount: true,
        commission_affiliate: true,
        status: true,
        converted_at: true,
        product_id: true,
        quantity: true,
        merchant_products: { select: { name: true, image_url: true } }
      }
    });

    // ---- AGGREGATE ----
    // Toplam satış quantity’ye göre!
    const totalClicks = clickRecords.length;
    const totalSales = saleRecords.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
    const totalEarnings = confirmedSalesRaw.reduce((sum, s) => sum + Number(s.commission_affiliate), 0);

    // Dropdown ürün seçenekleri
    const productOptions = [
      { product_id: 0, name: "All Products" },
      ...activeProducts.map(p => ({ product_id: p.product_id, name: p.name }))
    ];

    // Confirmed sales quantity ile maplenir
    const allConfirmedSales = confirmedSalesRaw.map(s => ({
      sale_id: s.sale_id,
      product_id: s.product_id,
      productName: s.merchant_products?.name ?? 'Product',
      productImage: s.merchant_products?.image_url ?? null,
      date: s.converted_at.toISOString().slice(0, 10),
      amount: Number(s.amount),
      commission: Number(s.commission_affiliate),
      status: s.status,
      quantity: typeof s.quantity === "number" && s.quantity > 0 ? s.quantity : 1
    }));

    return NextResponse.json({
      products: productOptions,
      totalClicks,
      totalSales,         // <-- Toplam satış (quantity ile)
      totalEarnings,
      clickRecords,
      saleRecords,        // <-- Her satışta quantity var
      confirmedSales: allConfirmedSales,
      allConfirmedSales
    });

  } catch (err) {
    console.error("Performance API error:", err);
    return NextResponse.json({ error: "Performance fetch error" }, { status: 500 });
  }
}
