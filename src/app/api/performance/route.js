// @ts-nocheck
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Security Docblock (Cabo PROD)
 * - Auth: NextAuth session zorunlu; status === 'active'
 * - RBAC: role ∈ {affiliate, admin}
 * - Input: Zod ile doğrulama
 * - Rate limit: GET 60/dk (IP+userId)
 * - Headers: no-store, nosniff, frame-ancestors 'none', strict-origin-when-cross-origin; HSTS(prod)
 * - API sözleşmesi: { ok, request_id, ... } | { error, request_id, retry_after? }
 * - DB: Yalnız Prisma
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import * as z from "zod";
import { randomUUID } from "crypto";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

/* -------------------- helpers -------------------- */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const toNumber = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function getRequestId(req) {
  return req.headers.get("x-request-id") || randomUUID();
}
function ipFromRequest(req) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.ip || req.headers.get("x-real-ip") || "0.0.0.0";
}
function secureHeaders(res, requestId) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox"
  );
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  if (requestId) res.headers.set("X-Request-Id", requestId);
  return res;
}
function jsonError(status, error, requestId, retryAfterSec) {
  const res = NextResponse.json(
    { error, request_id: requestId },
    { status, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : {} }
  );
  return secureHeaders(res, requestId);
}
function jsonOk(payload, requestId) {
  const res = NextResponse.json({ ok: true, request_id: requestId, ...payload }, { status: 200 });
  return secureHeaders(res, requestId);
}

// Tarih yardımcıları
function parseYYYYMMDD(s) {
  return new Date(`${s}T00:00:00.000Z`);
}
function endOfDayUTC(s) {
  return new Date(`${s}T23:59:59.999Z`);
}
function fmtYYYYMMDD_UTC(d) {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtLocalDate(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtLocalTimeSec(d) {
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  const ss = `${d.getSeconds()}`.padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/* -------------------- validation -------------------- */

const schema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  productIds: z.string().optional(), // "123" veya "123,456"
  page: z.string().transform((s) => clamp(parseInt(s || "1", 10) || 1, 1, 1_000_000)).optional(),
  pageSize: z.string().transform((s) => clamp(parseInt(s || "5", 10) || 5, 1, 5)).optional(),
  clickPage: z.string().transform((s) => clamp(parseInt(s || "1", 10) || 1, 1, 1_000_000)).optional(),
  clickPageSize: z.string().transform((s) => clamp(parseInt(s || "5", 10) || 5, 1, 5)).optional(),
});

/* -------------------- GET -------------------- */

export async function GET(req) {
  const requestId = getRequestId(req);

  // AuthN
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const userId = typeof user?.id === "string" ? parseInt(user.id, 10) : user?.id;
  if (!userId) return jsonError(401, "unauthorized", requestId);

  // AuthZ
  const role = (user.role || "").toLowerCase();
  const status = (user.status || "").toLowerCase();
  if (status !== "active") return jsonError(403, "forbidden_inactive", requestId);
  if (role !== "affiliate" && role !== "admin") return jsonError(403, "forbidden_role", requestId);

  // Rate limit
  const ip = ipFromRequest(req);
  try {
    const key = makeRateLimitKey("api:performance:get", userId, ip);
    const rl = await checkRateLimit(key, { limit: 60, window: 60 });
    if (!rl.allowed) return jsonError(429, "rate_limited", requestId, rl.retryAfter);
  } catch {
    // fail-soft
  }

  // Inputs
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return jsonError(400, "invalid_query", requestId);
  const q = parsed.data;

  // Tarih aralığı (default: son 365 gün)
  let startDate = q.startDate ? parseYYYYMMDD(q.startDate) : null;
  let endDate = q.endDate ? endOfDayUTC(q.endDate) : null;
  if (!startDate || !endDate) {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(end.getDate() - 364);
    start.setHours(0, 0, 0, 0);
    startDate = start;
    endDate = end;
  }
  if (startDate > endDate) {
    const t = startDate;
    startDate = endDate;
    endDate = t;
  }

  // Ürün filtresi
  let productIdList = [];
  if (q.productIds && q.productIds.trim() !== "") {
    productIdList = q.productIds
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 5;
  const clickPage = q.clickPage ?? 1;
  const clickPageSize = q.clickPageSize ?? 5;

  // WHERE
  const whereClick = {
    clickedAt: { gte: startDate, lte: endDate },
    affiliateLink: {
      userId,
      ...(productIdList.length ? { productId: { in: productIdList } } : {}),
    },
  };

  const whereSalesAll = {
    userId,
    convertedAt: { gte: startDate, lte: endDate },
    ...(productIdList.length ? { productId: { in: productIdList } } : {}),
  };
  const whereSalesConfirmed = { ...whereSalesAll, status: "confirmed" };

  try {
    /* ---------- PRODUCTS ---------- */
    const links = await prisma.affiliateLink.findMany({
      where: { userId },
      select: {
        productId: true,
        product: { select: { productId: true, name: true, imageUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const products = [];
    const seen = new Set();
    for (const l of links) {
      const p = l.product;
      const pid = p?.productId ?? l.productId;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      products.push({ productId: pid, name: p?.name || `#${pid}`, imageUrl: p?.imageUrl ?? null });
    }

    /* ---------- PARALLEL QUERIES ---------- */
    const [
      clicksCount,
      salesQtyAllAgg,
      salesQtyConfAgg,

      sumSalesAll, // _sum.commissionAffiliate (tüm statüler)
      sumConfirmedParts, // _sum.commissionAffiliate + _sum.commissionPlatform (net için)

      clicksPageRows,
      salesPageRows,

      salesRowsCountConfirmed, // pager sayacı
      clicksForDaily,
      salesConfirmedForDaily,
    ] = await prisma.$transaction([
      prisma.click.count({ where: whereClick }),

      // adet = quantity toplamı
      prisma.affiliateUserSale.aggregate({
        _sum: { quantity: true },
        where: whereSalesAll,
      }),
      prisma.affiliateUserSale.aggregate({
        _sum: { quantity: true },
        where: whereSalesConfirmed,
      }),

      prisma.affiliateUserSale.aggregate({
        _sum: { commissionAffiliate: true },
        where: whereSalesAll,
      }),
      prisma.affiliateUserSale.aggregate({
        _sum: { commissionAffiliate: true, commissionPlatform: true },
        where: whereSalesConfirmed,
      }),

      prisma.click.findMany({
        where: whereClick,
        select: {
          clickId: true,
          clickedAt: true,
          userAgent: true,
          affiliateLink: {
            select: {
              productId: true,
              product: {
                select: {
                  productId: true,
                  name: true,
                  imageUrl: true,
                  merchant: { select: { companyName: true } },
                },
              },
            },
          },
        },
        orderBy: { clickedAt: "desc" },
        skip: (clickPage - 1) * clickPageSize,
        take: clickPageSize,
      }),

      prisma.affiliateUserSale.findMany({
        where: whereSalesConfirmed,
        select: {
          saleId: true,
          orderId: true,
          convertedAt: true,
          productId: true,
          amount: true,
          quantity: true,
          status: true,
          commissionAffiliate: true,
          commissionPlatform: true,
          payoutItem: { select: { status: true } },
          merchantProduct: {
            select: {
              productId: true,
              name: true,
              imageUrl: true,
              merchant: { select: { companyName: true } },
            },
          },
        },
        orderBy: { convertedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),

      prisma.affiliateUserSale.count({ where: whereSalesConfirmed }),

      prisma.click.findMany({ where: whereClick, select: { clickedAt: true } }),
      prisma.affiliateUserSale.findMany({
        where: whereSalesConfirmed,
        select: { convertedAt: true, commissionAffiliate: true, commissionPlatform: true, quantity: true },
      }),
    ]);

    /* ---------- MAP: clicks ---------- */
    const clickRows = clicksPageRows.map((c) => {
      const dt = new Date(c.clickedAt);
      const p = c.affiliateLink?.product || {};
      return {
        clickId: c.clickId,
        date: fmtLocalDate(dt),
        time: fmtLocalTimeSec(dt),
        productId: p?.productId ?? c.affiliateLink?.productId ?? null,
        productName: p?.name || (p?.productId ? `#${p.productId}` : "-"),
        productImage: p?.imageUrl ?? null,
        company: p?.merchant?.companyName ?? "-",
        userAgent: c.userAgent ?? null,
      };
    });

    /* ---------- MAP: sales ---------- */
    const salesRows = salesPageRows.map((s) => {
      const p = s.merchantProduct || {};
      const dt = new Date(s.convertedAt);
      const commission = toNumber(s.commissionAffiliate, 0);
      const platformFee = toNumber(s.commissionPlatform, 0);
      const net = commission - platformFee;
      return {
        saleId: s.saleId,
        orderId: s.orderId ?? null,
        date: fmtLocalDate(dt),
        time: fmtLocalTimeSec(dt),
        productId: p?.productId ?? s.productId ?? null,
        productName: p?.name || `#${p?.productId ?? s.productId ?? ""}`,
        productImage: p?.imageUrl ?? null,
        company: p?.merchant?.companyName ?? "-",
        amount: toNumber(s.amount, 0),
        commission,
        platformFee,
        net,
        quantity: toNumber(s.quantity, 1),
        status: s.status || "confirmed",
        payoutStatus: s?.payoutItem?.status ?? "unpaid",
      };
    });

    /* ---------- TOPLAMLAR ---------- */
    const earningsAll = toNumber(sumSalesAll?._sum?.commissionAffiliate, 0);
    const confAff = toNumber(sumConfirmedParts?._sum?.commissionAffiliate, 0);
    const confPlat = toNumber(sumConfirmedParts?._sum?.commissionPlatform, 0);
    const netConfirmed = confAff - confPlat;

    const salesQtyAll = toNumber(salesQtyAllAgg?._sum?.quantity, 0);
    const salesQtyConf = toNumber(salesQtyConfAgg?._sum?.quantity, 0);

    const totals = {
      clicks: clicksCount,
      sales: salesQtyAll,
      confirmedSales: salesQtyConf,
      earnings: earningsAll,
      netEarnings: netConfirmed,
      cr: clicksCount > 0 ? Number(((salesQtyConf / clicksCount) * 100).toFixed(2)) : 0,
    };

    /* ---------- DAILY (grafik) ---------- */
    const dayMs = 24 * 60 * 60 * 1000;
    const startUTC = Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate()
    );
    const endUTC = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    const dayIndex = new Map();
    for (let t = startUTC; t <= endUTC; t += dayMs) {
      const key = fmtYYYYMMDD_UTC(new Date(t));
      dayIndex.set(key, { date: key, clicks: 0, confirmed: 0, net: 0 });
    }
    for (const c of clicksForDaily) {
      const key = fmtYYYYMMDD_UTC(new Date(c.clickedAt));
      const row = dayIndex.get(key);
      if (row) row.clicks += 1;
    }
    for (const s of salesConfirmedForDaily) {
      const key = fmtYYYYMMDD_UTC(new Date(s.convertedAt));
      const row = dayIndex.get(key);
      if (row) {
        row.confirmed += toNumber(s.quantity, 1);
        row.net += toNumber(s.commissionAffiliate, 0) - toNumber(s.commissionPlatform, 0);
      }
    }
    const daily = Array.from(dayIndex.values()).sort((a, b) => (a.date < b.date ? -1 : 1));

    /* ---------- RESPONSE ---------- */
    return jsonOk(
      {
        products,
        totals,
        daily,
        confirmedSales: {
          total: salesRowsCountConfirmed,
          rows: salesRows,
        },
        clicks: { total: clicksCount, rows: clickRows },
        cache: "no-store",
        range: { startDate: fmtYYYYMMDD_UTC(startDate), endDate: fmtYYYYMMDD_UTC(endDate) },
      },
      requestId
    );
  } catch (err) {
    return jsonError(500, "server_error", requestId);
  }
}
