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
    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.userId;

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
      where: { userId: userId, isVisible: true },
      select: { productId: true }
    });
    const allProductIds = [...new Set(userLinks.map(l => l.productId))];
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
      where: { productId: { in: allProductIds }, isActive: true },
      select: { productId: true, name: true, image_url: true }
    });

    // Seçili ürün filtrelemesi
    let filteredProductIds = activeProducts.map(p => p.productId);
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
          userId: userId,
          productId: { in: filteredProductIds }
        },
        ...(startDate || endDate ? { clicked_at: dateFilter } : {})
      },
      select: {
        clicked_at: true,
        affiliate_link: { select: { productId: true } }
      }
    });
    const clickRecords = clickRecordsRaw.map(r => ({
      date: r.clicked_at.toISOString().slice(0, 10),
      productId: r.affiliate_link.productId
    }));

    // 7. Satış kayıtları (quantity destekli!)
    const saleRecordsRaw = await prisma.affiliateUserSale.findMany({
      where: {
        userId: userId,
        productId: { in: filteredProductIds },
        ...(startDate || endDate ? { convertedAt: dateFilter } : {}),
      },
      select: {
        convertedAt: true,
        productId: true,
        quantity: true // <--- quantity çekiliyor!
      }
    });
    // quantity null ise 1 alınır (default)
    const saleRecords = saleRecordsRaw.map(r => ({
      date: r.convertedAt.toISOString().slice(0, 10),
      productId: r.productId,
      quantity: typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 1
    }));

    // 8. Confirmed Sales listesi (quantity ile!)
    const confirmedSalesRaw = await prisma.affiliateUserSale.findMany({
      where: {
        userId: userId,
        productId: { in: filteredProductIds },
        status: "confirmed",
        ...(startDate || endDate ? { convertedAt: dateFilter } : {}),
      },
      orderBy: { convertedAt: "desc" },
      select: {
        saleId: true,
        amount: true,
        commissionAffiliate: true,
        status: true,
        convertedAt: true,
        productId: true,
        quantity: true,
        merchantProducts: { select: { name: true, image_url: true } }
      }
    });

    // ---- AGGREGATE ----
    // Toplam satış quantity’ye göre!
    const totalClicks = clickRecords.length;
    const totalSales = saleRecords.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
    const totalEarnings = confirmedSalesRaw.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

    // Dropdown ürün seçenekleri
    const productOptions = [
      { productId: 0, name: "All Products" },
      ...activeProducts.map(p => ({ productId: p.productId, name: p.name }))
    ];

    // Confirmed sales quantity ile maplenir
    const allConfirmedSales = confirmedSalesRaw.map(s => ({
      saleId: s.saleId,
      productId: s.productId,
      productName: s.merchantProducts?.name ?? 'Product',
      productImage: s.merchantProducts?.image_url ?? null,
      date: s.convertedAt.toISOString().slice(0, 10),
      amount: Number(s.amount),
      commission: Number(s.commissionAffiliate),
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
