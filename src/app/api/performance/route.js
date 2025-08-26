export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Performance API (prod)
 * Auth: NextAuth (role: affiliate|admin, status: active)
 * RL  : 30 req/min (IP+user)
 * Returns:
 *  - products (id, name, imageUrl, isActive)
 *  - totals   (clicks, sales, confirmedSales, earnings, revenue, cr)
 *  - daily    [{date, clicks, sales, confirmed, earnings}]
 *  - perProduct [{productId, name, imageUrl, isActive, clicks, sales, confirmed, earnings, cr}]
 *  - confirmedSales (son 200)
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
  if (!["affiliate", "admin"].includes(user.role)) return j({ error: "forbidden_role" }, { status: 403 });

  // rate limit
  try {
    const key = makeRateLimitKey(req, { scope: "performance", userId: user.id });
    const { ok, resetMs } = await checkRateLimit({ key, limit: 30, windowMs: 60_000 });
    if (!ok)
      return j(
        { error: "api.performance.ratelimit", retry_after: Math.ceil((resetMs || 0) / 1000) },
        { status: 429 }
      );
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
  const gte = sod(startDate);
  const lte = eod(endDate);
  const range = {};
  if (gte) range.gte = gte;
  if (lte) range.lte = lte;
  const useDate = !!(gte || lte);

  try {
    // Kullanıcının sahip olduğu ürünler
    const links = await prisma.affiliateLink.findMany({
      where: { userId: user.id, isVisible: true },
      select: { productId: true },
    });
    const myProductIds = [...new Set(links.map((l) => l.productId))];

    if (myProductIds.length === 0) {
      return j({
        ok: true,
        products: [],
        totals: { clicks: 0, sales: 0, confirmedSales: 0, earnings: 0, revenue: 0, cr: 0 },
        daily: [],
        perProduct: [],
        confirmedSales: [],
      });
    }

    const products = await prisma.merchantProduct.findMany({
      where: { productId: { in: myProductIds } },
      select: { productId: true, name: true, imageUrl: true, isActive: true },
      orderBy: { name: "asc" },
    });

    // filtre: 0 => hepsi
    const can = new Set(myProductIds);
    let filtered = myProductIds;
    if (productIds.length && !productIds.includes(0)) {
      filtered = productIds.filter((id) => can.has(id));
      if (!filtered.length) {
        return j({
          ok: true,
          products,
          totals: { clicks: 0, sales: 0, confirmedSales: 0, earnings: 0, revenue: 0, cr: 0 },
          daily: [],
          perProduct: [],
          confirmedSales: [],
        });
      }
    }

    // CLICKS
    const clicksRaw = await prisma.click.findMany({
      where: {
        affiliateLink: { userId: user.id, productId: { in: filtered } },
        ...(useDate ? { clickedAt: range } : {}),
      },
      select: { clickedAt: true, affiliateLink: { select: { productId: true } } },
      orderBy: { clickedAt: "asc" },
    });

    // SALES
    const salesRaw = await prisma.affiliateUserSale.findMany({
      where: {
        userId: user.id,
        productId: { in: filtered },
        ...(useDate ? { convertedAt: range } : {}),
      },
      select: {
        convertedAt: true,
        productId: true,
        quantity: true,
        status: true,
        amount: true,
        commissionAffiliate: true,
      },
      orderBy: { convertedAt: "asc" },
    });

    // CONFIRMED list (limit 200)
    const confirmedRaw = await prisma.affiliateUserSale.findMany({
      where: {
        userId: user.id,
        productId: { in: filtered },
        status: "confirmed",
        ...(useDate ? { convertedAt: range } : {}),
      },
      orderBy: { convertedAt: "desc" },
      take: 200,
      select: {
        saleId: true,
        orderId: true,
        productId: true,
        amount: true,
        commissionAffiliate: true,
        quantity: true,
        status: true,
        convertedAt: true,
        merchantProduct: { select: { name: true, imageUrl: true } },
      },
    });

    // ---- Aggregations ----
    const dailyMap = new Map(); // date -> {clicks,sales,confirmed,earnings}
    const pp = new Map(); // productId -> {clicks,sales,confirmed,earnings}

    const incPP = (pid, key, v = 1) => {
      const base = pp.get(pid) || { clicks: 0, sales: 0, confirmed: 0, earnings: 0 };
      base[key] += v;
      pp.set(pid, base);
    };
    const incDay = (d, key, v = 1) => {
      const base = dailyMap.get(d) || { clicks: 0, sales: 0, confirmed: 0, earnings: 0 };
      base[key] += v;
      dailyMap.set(d, base);
    };

    for (const r of clicksRaw) {
      const d = r.clickedAt.toISOString().slice(0, 10);
      const pid = r.affiliateLink.productId;
      incPP(pid, "clicks", 1);
      incDay(d, "clicks", 1);
    }

    for (const r of salesRaw) {
      const d = r.convertedAt.toISOString().slice(0, 10);
      const pid = r.productId;
      const qty = Number.isFinite(r.quantity) && r.quantity > 0 ? r.quantity : 1;
      incPP(pid, "sales", qty);
      incDay(d, "sales", qty);
      if (r.status === "confirmed") {
        const comm = Number(r.commissionAffiliate || 0);
        incPP(pid, "confirmed", qty);
        incPP(pid, "earnings", comm);
        incDay(d, "confirmed", qty);
        incDay(d, "earnings", comm);
      }
    }

    const daily = Array.from(dailyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, ...v }));

    const perProduct = Array.from(pp.entries())
      .map(([productId, v]) => {
        const meta = products.find((p) => p.productId === productId);
        const cr = v.clicks > 0 ? +(v.confirmed / v.clicks).toFixed(4) : 0;
        return {
          productId,
          name: meta?.name || "",
          imageUrl: meta?.imageUrl || null,
          isActive: !!meta?.isActive,
          clicks: v.clicks,
          sales: v.sales,
          confirmed: v.confirmed,
          earnings: +Number(v.earnings || 0).toFixed(2),
          cr,
        };
      })
      .sort((a, b) => b.earnings - a.earnings);

    const totals = {
      clicks: clicksRaw.length,
      sales: salesRaw.reduce((a, r) => a + (Number(r.quantity) || 1), 0),
      confirmedSales: salesRaw.reduce(
        (a, r) => a + (r.status === "confirmed" ? (Number(r.quantity) || 1) : 0),
        0
      ),
      earnings: +salesRaw
        .filter((r) => r.status === "confirmed")
        .reduce((a, r) => a + Number(r.commissionAffiliate || 0), 0)
        .toFixed(2),
      revenue: +salesRaw
        .filter((r) => r.status === "confirmed")
        .reduce((a, r) => a + Number(r.amount || 0), 0)
        .toFixed(2),
      cr:
        clicksRaw.length > 0
          ? +(
              salesRaw
                .filter((r) => r.status === "confirmed")
                .reduce((a, r) => a + (Number(r.quantity) || 1), 0) / clicksRaw.length
            ).toFixed(4)
          : 0,
    };

    const confirmedSales = confirmedRaw.map((s) => ({
      saleId: s.saleId,
      orderId: s.orderId,
      date: s.convertedAt.toISOString().slice(0, 10),
      productId: s.productId,
      productName: s.merchantProduct?.name || "",
      productImage: s.merchantProduct?.imageUrl || null,
      amount: Number(s.amount || 0),
      commission: Number(s.commissionAffiliate || 0),
      quantity: Number.isFinite(s.quantity) && s.quantity > 0 ? s.quantity : 1,
      status: s.status,
    }));

    return j({
      ok: true,
      products,
      totals,
      daily,
      perProduct,
      confirmedSales,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        productIds: filtered,
      },
    });
  } catch (e) {
    console.error("Performance API error:", e);
    return j({ error: "api.performance.serverError" }, { status: 500 });
  }
}
