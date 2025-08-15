// app/api/performance/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

// Query şeması (GET /api/performance?startDate=...&endDate=...&productIds=1,2)
const querySchema = z.object({
  startDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"))
    .optional()
    .nullable(),
  endDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"))
    .optional()
    .nullable(),
  productIds: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return [];
      return v
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0);
    }),
});

function toEndOfDayISO(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T23:59:59.999Z`);
  }
  return new Date(dateStr);
}

function toStartOfDayISO(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
  return new Date(dateStr);
}

export async function GET(req) {
  try {
    // 1) Rate limit (IP bazlı 20/dk)
    const rlKey = makeRateLimitKey(req, { scope: "performance" });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 2) Auth (NextAuth session) + RBAC
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (role !== "affiliate") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 3) Query parse + validation
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      productIds: searchParams.get("productIds"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    const { startDate, endDate, productIds = [] } = parsed.data;

    // 4) Kullanıcının aktif affiliate ürünleri
    const userLinks = await prisma.affiliateLink.findMany({
      where: { userId, isVisible: true },
      select: { productId: true },
    });
    const allProductIds = [...new Set(userLinks.map((l) => l.productId))];
    if (allProductIds.length === 0) {
      return NextResponse.json(
        {
          products: [],
          totalClicks: 0,
          totalSales: 0,
          totalEarnings: 0,
          clickRecords: [],
          saleRecords: [],
          confirmedSales: [],
          allConfirmedSales: [],
        },
        { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
      );
    }

    const activeProducts = await prisma.merchantProduct.findMany({
      where: { productId: { in: allProductIds }, isActive: true },
      // image_url burada seçiliyor ama UI'da kullanılmıyor; Prisma hatasını önler
      select: { productId: true, name: true, image_url: true },
    });

    // Seçili ürün filtresi (0 → Tümü)
    let filteredProductIds = activeProducts.map((p) => p.productId);
    if (productIds.length > 0 && !productIds.includes(0)) {
      const allowed = new Set(filteredProductIds);
      filteredProductIds = productIds.filter((id) => allowed.has(id));
      if (filteredProductIds.length === 0) {
        return NextResponse.json(
          {
            products: [{ productId: 0, name: "All Products" }, ...activeProducts.map((p) => ({ productId: p.productId, name: p.name }))],
            totalClicks: 0,
            totalSales: 0,
            totalEarnings: 0,
            clickRecords: [],
            saleRecords: [],
            confirmedSales: [],
            allConfirmedSales: [],
          },
          { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
        );
      }
    }

    // 5) Tarih filtreleri
    const dateFilter = {};
    const gte = toStartOfDayISO(startDate);
    const lte = toEndOfDayISO(endDate);
    if (gte) dateFilter.gte = gte;
    if (lte) dateFilter.lte = lte;
    const useDateFilter = Boolean(gte || lte);

    // 6) Click kayıtları
    const clickRecordsRaw = await prisma.click.findMany({
      where: {
        affiliateLink: { userId, productId: { in: filteredProductIds } },
        ...(useDateFilter ? { clickedAt: dateFilter } : {}),
      },
      select: {
        clickedAt: true,
        affiliateLink: { select: { productId: true } },
      },
    });

    const clickRecords = clickRecordsRaw.map((r) => ({
      date: r.clickedAt.toISOString().slice(0, 10),
      productId: r.affiliateLink.productId,
    }));

    // 7) Satış kayıtları (quantity destekli)
    const saleRecordsRaw = await prisma.affiliateUserSale.findMany({
      where: {
        userId,
        productId: { in: filteredProductIds },
        ...(useDateFilter ? { convertedAt: dateFilter } : {}),
      },
      select: {
        convertedAt: true,
        productId: true,
        quantity: true,
      },
    });

    const saleRecords = saleRecordsRaw.map((r) => ({
      date: r.convertedAt.toISOString().slice(0, 10),
      productId: r.productId,
      quantity: typeof r.quantity === "number" && r.quantity > 0 ? r.quantity : 1,
    }));

    // 8) Onaylı satış listesi (quantity ile) — ⬇️ image_url kullan
    const confirmedSalesRaw = await prisma.affiliateUserSale.findMany({
      where: {
        userId,
        productId: { in: filteredProductIds },
        status: "confirmed",
        ...(useDateFilter ? { convertedAt: dateFilter } : {}),
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
        merchantProduct: { select: { name: true, image_url: true } }, // ⬅️ düzeltildi
      },
    });

    // ---- AGGREGATE ----
    const totalClicks = clickRecords.length;
    const totalSales = saleRecords.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
    const totalEarnings = confirmedSalesRaw.reduce(
      (sum, s) => sum + Number(s.commissionAffiliate),
      0
    );

    const productOptions = [
      { productId: 0, name: "All Products" },
      ...activeProducts.map((p) => ({ productId: p.productId, name: p.name })),
    ];

    const allConfirmedSales = confirmedSalesRaw.map((s) => ({
      saleId: s.saleId,
      productId: s.productId,
      productName: s.merchantProduct?.name ?? "Product",
      productImage: s.merchantProduct?.image_url ?? null, // ⬅️ düzeltildi
      date: s.convertedAt.toISOString().slice(0, 10),
      amount: Number(s.amount),
      commission: Number(s.commissionAffiliate),
      status: s.status,
      quantity: typeof s.quantity === "number" && s.quantity > 0 ? s.quantity : 1,
    }));

    return NextResponse.json(
      {
        products: productOptions,
        totalClicks,
        totalSales,
        totalEarnings,
        clickRecords,
        saleRecords,
        confirmedSales: allConfirmedSales, // backward compat
        allConfirmedSales,
      },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
    );
  } catch (err) {
    console.error("Performance API error:", err);
    return NextResponse.json({ error: "Performance fetch error" }, { status: 500 });
  }
}
