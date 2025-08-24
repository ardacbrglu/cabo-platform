export const dynamic = "force-dynamic";

/**
 * Performance API
 * - Auth: NextAuth (role: affiliate|admin, status: active)
 * - Rate limit: 30 req/min (IP+user)
 * - Returns: products, clickRecords, saleRecords, confirmedSales, totals
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

const Query = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  productIds: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isInteger(n) && n >= 0)
        : []
    ),
});

const sod = (d) => (d ? new Date(`${d}T00:00:00.000Z`) : null);
const eod = (d) => (d ? new Date(`${d}T23:59:59.999Z`) : null);

function j(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET(req) {
  // auth
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return j({ error: "api.performance.unauthorized" }, { status: 401 });
  if (user.status !== "active") return j({ error: "forbidden_status" }, { status: 403 });
  if (!["affiliate", "admin"].includes(user.role))
    return j({ error: "forbidden_role" }, { status: 403 });

  // rate limit
  try {
    const key = makeRateLimitKey(req, { scope: "performance", userId: user.id });
    const { ok, resetMs } = await checkRateLimit({ key, limit: 30, windowMs: 60_000 });
    if (!ok) return j({ error: "api.performance.ratelimit", retry_after: Math.ceil((resetMs || 0)/1000) }, { status: 429 });
  } catch {}

  // query
  const { searchParams } = new URL(req.url);
  const parsed = Query.safeParse({
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    productIds: searchParams.get("productIds"),
  });
  if (!parsed.success) return j({ error: "invalid_query" }, { status: 400 });

  const { startDate, endDate, productIds = [] } = parsed.data;
  const range = {};
  const gte = sod(startDate);
  const lte = eod(endDate);
  if (gte) range.gte = gte;
  if (lte) range.lte = lte;
  const useDate = !!(gte || lte);

  try {
    // Kullanıcı linklerinden ürün havuzu
    const links = await prisma.affiliateLink.findMany({
      where: { userId: user.id, isVisible: true },
      select: { productId: true },
    });
    const myProductIds = [...new Set(links.map((l) => l.productId))];
    if (myProductIds.length === 0) {
      return j({
        ok: true,
        products: [],
        clickRecords: [],
        saleRecords: [],
        confirmedSales: [],
        totals: { clicks: 0, sales: 0, confirmedSales: 0, earnings: 0 },
      });
    }

    const products = await prisma.merchantProduct.findMany({
      where: { productId: { in: myProductIds } },
      select: { productId: true, name: true, image_url: true, imageUrl: true, isActive: true },
      orderBy: { name: "asc" },
    });

    // filtre
    const can = new Set(myProductIds);
    let filtered = myProductIds;
    if (productIds.length && !productIds.includes(0)) {
      filtered = productIds.filter((id) => can.has(id));
      if (!filtered.length) {
        return j({
          ok: true,
          products,
          clickRecords: [],
          saleRecords: [],
          confirmedSales: [],
          totals: { clicks: 0, sales: 0, confirmedSales: 0, earnings: 0 },
        });
      }
    }

    const clicksRaw = await prisma.click.findMany({
      where: {
        affiliateLink: { userId: user.id, productId: { in: filtered } },
        ...(useDate ? { clickedAt: range } : {}),
      },
      select: { clickedAt: true, affiliateLink: { select: { productId: true } } },
      orderBy: { clickedAt: "asc" },
    });
    const clickRecords = clicksRaw.map((r) => ({
      date: r.clickedAt.toISOString().slice(0, 10),
      productId: r.affiliateLink.productId,
    }));

    const salesRaw = await prisma.affiliateUserSale.findMany({
      where: { userId: user.id, productId: { in: filtered }, ...(useDate ? { convertedAt: range } : {}) },
      select: { convertedAt: true, productId: true, quantity: true, status: true },
      orderBy: { convertedAt: "asc" },
    });
    const saleRecords = salesRaw.map((r) => ({
      date: r.convertedAt.toISOString().slice(0, 10),
      productId: r.productId,
      quantity: Number.isFinite(r.quantity) && r.quantity > 0 ? r.quantity : 1,
      status: r.status,
    }));

    const confirmedRaw = await prisma.affiliateUserSale.findMany({
      where: { userId: user.id, productId: { in: filtered }, status: "confirmed", ...(useDate ? { convertedAt: range } : {}) },
      orderBy: { convertedAt: "desc" },
      select: {
        saleId: true,
        productId: true,
        amount: true,
        commissionAffiliate: true,
        quantity: true,
        status: true,
        convertedAt: true,
        merchantProduct: { select: { name: true, image_url: true, imageUrl: true } },
      },
    });

    const confirmedSales = confirmedRaw.map((s) => ({
      saleId: s.saleId,
      date: s.convertedAt.toISOString().slice(0, 10),
      productId: s.productId,
      productName: s.merchantProduct?.name || "",
      productImage: s.merchantProduct?.imageUrl || s.merchantProduct?.image_url || null,
      amount: Number(s.amount || 0),
      commission: Number(s.commissionAffiliate || 0),
      quantity: Number.isFinite(s.quantity) && s.quantity > 0 ? s.quantity : 1,
      status: s.status,
    }));

    const totals = {
      clicks: clickRecords.length,
      sales: saleRecords.reduce((a, b) => a + (b.quantity || 1), 0),
      confirmedSales: confirmedSales.reduce((a, b) => a + (b.quantity || 1), 0),
      earnings: confirmedSales.reduce((a, b) => a + (b.commission || 0), 0),
    };

    return j({ ok: true, products, clickRecords, saleRecords, confirmedSales, totals });
  } catch (e) {
    console.error("Performance API error:", e);
    return j({ error: "api.performance.serverError" }, { status: 500 });
  }
}
