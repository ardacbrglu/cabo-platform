export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";

/* ───────── helpers ───────── */
function j(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

// NextAuth CSRF: header↔cookie eşleşmesi
function validateNextAuthCsrf(req) {
  const header = req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
  if (!header) return false;
  const cookie = req.headers.get("cookie") || "";
  const m =
    cookie.match(/(?:^|;\s*)(?:__Host-)?next-auth\.csrf-token=([^;]+)/i) ||
    cookie.match(/(?:^|;\s*)next-auth\.csrf-token=([^;]+)/i);
  if (!m) return false;
  const token = decodeURIComponent(m[1]).split("|")[0];
  return token && token === header;
}

// POST istekleri için Origin/Referer + AJAX zoru
function enforceOrigin(req) {
  const xrw = (req.headers.get("x-requested-with") || "").toLowerCase();
  if (xrw !== "xmlhttprequest") return false;
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const allowed = new Set([host].filter(Boolean));
  const okh = (u) => { try { return !u || allowed.has(new URL(u).host); } catch { return false; } };
  return okh(origin) && okh(referer);
}

const RequestSchema = z.object({
  itemIds: z.array(
    z.union([
      z.number().int().positive(),
      z.string().regex(/^\d+$/).transform((s) => Number(s)),
    ])
  ).min(1).max(100),
});

const DEV = process.env.NODE_ENV !== "production";

/* ───────── POST ───────── */
export async function POST(req) {
  try {
    // CSRF + Origin
    if (!validateNextAuthCsrf(req)) return j({ error: "Invalid CSRF token" }, { status: 403 });
    if (!enforceOrigin(req)) return j({ error: "Bad Origin" }, { status: 403 });

    // AuthZ
    const session = await getServerSession(authOptions);
    const user = session?.user;
    if (!user?.id || user.role !== "merchant") return j({ error: "Unauthorized" }, { status: 401 });

    // Rate limit
    const rlKey = makeRateLimitKey(req, { scope: "merchant-payout-details", userId: user.id });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    if (!ok) {
      return j(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 60_000) / 1000)) } }
      );
    }

    // Input
    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) return j({ error: "Invalid payload" }, { status: 400 });
    const ids = parsed.data.itemIds;

    // İlgili merchant’a ait item’lar (camelCase Prisma)
    const items = await prisma.payoutRequestItem.findMany({
      where: {
        merchantId: user.id,
        itemId: { in: ids },
      },
      select: {
        itemId: true,
        amount: true,
        status: true,
        sourceSaleIds: true,
        payoutRequest: { select: { realUserFullname: true, requestedAt: true } },
      },
    });

    if (!items.length) return j({ error: "No payout items found" }, { status: 404 });

    // Satışları topla
    const sales = [];
    for (const it of items) {
      const saleIds = String(it.sourceSaleIds || "")
        .split(",")
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (!saleIds.length) continue;

      const rows = await prisma.affiliateUserSale.findMany({
        where: { saleId: { in: saleIds } },
        select: {
          orderId: true,
          amount: true,
          commissionAffiliate: true,
          quantity: true,
          status: true,
          convertedAt: true,
          productId: true,
          affiliateLinkId: true,
        },
      });

      for (const s of rows) {
        sales.push({
          orderId: s.orderId,
          productId: s.productId,
          amount: Number(s.amount || 0),
          commission: Number(s.commissionAffiliate || 0),
          quantity: s.quantity ?? 0,
          status: s.status || "-",
          sale_date: s.convertedAt
            ? new Date(s.convertedAt).toISOString().slice(0, 19).replace("T", " ")
            : "-",
          has_affiliate_link: Boolean(s.affiliateLinkId),
        });
      }
    }

    // Ürün adları
    const pids = [...new Set(sales.map((s) => s.productId).filter(Boolean))];
    const products = pids.length
      ? await prisma.merchantProduct.findMany({
          where: { productId: { in: pids } },
          select: { productId: true, name: true },
        })
      : [];
    const pmap = Object.fromEntries(products.map((p) => [p.productId, p.name]));

    const details = sales.map((s) => ({
      orderId: s.orderId,
      product_name: pmap[s.productId] || "",
      amount: s.amount,
      commission: s.commission,
      quantity: s.quantity,
      sale_date: s.sale_date,
      status: s.status,
      has_affiliate_link: s.has_affiliate_link,
    }));

    const meta = {
      status: items[0]?.status || "",
      total: items.reduce((sum, i) => sum + Number(i.amount || 0), 0),
      requestDate: items[0]?.payoutRequest?.requestedAt?.toISOString?.() || "",
      affiliate_name: items[0]?.payoutRequest?.realUserFullname || "",
    };

    return j({ details, affiliate_name: meta.affiliate_name, meta });
  } catch (err) {
    if (DEV) console.error("POST /api/merchant/payments/details error:", err);
    return j({ error: "Internal server error" }, { status: 500 });
  }
}
