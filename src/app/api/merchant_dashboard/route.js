/**
 * Merchant Dashboard API (GET list, POST create, PATCH update/activate)
 * - AuthZ: requireMerchant() (DB doğrulamalı)
 * - Rate limit: GET 60/dk; POST/PATCH 10/dk (IP+userId)
 * - CSRF: POST/PATCH → NextAuth double-submit (header + cookie)
 * - Mutasyonlarda Origin/Referer & X-Requested-With zorunlu
 * - Tüm yanıtlarda Cache-Control: no-store + security headers
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import crypto from "node:crypto";
import { sanitize } from "@/lib/validation";
import { requireMerchant } from "@/lib/guards";

const DEV = process.env.NODE_ENV !== "production";

/* ────────── tiny utils ────────── */
const ridOf = (req) => req.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();
const ipUaOf = (req) => {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || "0.0.0.0";
  const ua = req.headers.get("user-agent") || "unknown";
  return { ip, ua };
};
const withSec = (res, rid) => {
  applyApiSecurityHeaders(res);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Request-Id", rid);
  return res;
};
const errorJson = (rid, status, message, extra = {}) =>
  withSec(NextResponse.json({ error: message, request_id: rid, ...extra }, { status }), rid);
const okJson = (rid, data, init = {}) => withSec(NextResponse.json(data, init), rid);

/* ────────── security helpers ────────── */
function validateNextAuthCsrf(req) {
  const headerToken = req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
  if (!headerToken) return false;
  const cookie = req.headers.get("cookie") || "";
  const m =
    cookie.match(/(?:^|;\s*)(?:__Host-)?next-auth\.csrf-token=([^;]+)/i) ||
    cookie.match(/(?:^|;\s*)next-auth\.csrf-token=([^;]+)/i);
  if (!m) return false;
  const cookieToken = decodeURIComponent(m[1]).split("|")[0];
  return cookieToken && cookieToken === headerToken;
}
function enforceOrigin(req) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const xrw = (req.headers.get("x-requested-with") || "").toLowerCase();
  if (xrw !== "xmlhttprequest") return false;

  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const envUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || "";

  const allowed = new Set(
    [host, envUrl].filter(Boolean).map((u) => {
      try { return new URL(u.startsWith("http") ? u : `https://${u}`).host; }
      catch { return u; }
    })
  );
  const ok = (u) => { try { return !u || allowed.has(new URL(u).host); } catch { return false; } };
  return ok(origin) && ok(referer);
}

/** checkRateLimit imza farklarını normalize eder */
async function rateLimitAnyShape({ key, limit, windowMs }) {
  try {
    const r = await checkRateLimit({ key, limit, windowMs });
    const ok = (r?.ok ?? r?.allowed ?? true);
    const resetMs = (r?.resetMs ?? (r?.retryAfterSec ? r.retryAfterSec * 1000 : undefined));
    return { ok, resetMs: resetMs ?? windowMs };
  } catch {}
  try {
    const r = await checkRateLimit(key, limit, Math.round(windowMs / 1000));
    const ok = (r?.ok ?? r?.allowed ?? true);
    const resetMs = (r?.resetMs ?? (r?.retryAfterSec ? r.retryAfterSec * 1000 : undefined));
    return { ok, resetMs: resetMs ?? windowMs };
  } catch {
    return { ok: true, resetMs: windowMs };
  }
}

async function enforceRate(req, rid, userId, limitPerMin) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = (fwd.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || "0.0.0.0";
  const key = `api:merchant_dashboard:${req.method}:${userId || "anon"}:${ip}`;
  const { ok, resetMs } = await rateLimitAnyShape({ key, limit: limitPerMin, windowMs: 60_000 });
  if (!ok) {
    const retry = Math.ceil((resetMs || 60_000) / 1000);
    const res = errorJson(rid, 429, "rate_limited", { retry_after: retry });
    res.headers.set("Retry-After", String(retry));
    return { blocked: true, res };
  }
  return { blocked: false };
}

/* ────────── prisma helpers ────────── */
function resolveModel(client, candidates, methods = ["findMany"]) {
  for (const n of candidates) {
    const m = client?.[n];
    if (m && methods.every((fn) => typeof m[fn] === "function")) return m;
  }
  return null;
}
async function findProductsForMerchant(Product, userId) {
  const tries = [
    { where: { merchantId: userId }, orderBy: { createdAt: "desc" } },
    { where: { merchant_id: userId }, orderBy: { created_at: "desc" } },
    { where: { ownerId: userId },     orderBy: { createdAt: "desc" } },
    { where: { owner_id: userId },    orderBy: { created_at: "desc" } },
  ];
  for (const t of tries) { try { return await Product.findMany(t); } catch {} }
  try { return await Product.findMany({ take: 500 }); } catch { return []; }
}
async function countLinksByProduct(prismaClient, ids) {
  const Link =
    resolveModel(prismaClient, ["affiliateLink", "affiliateLinks"]) ||
    resolveModel(prismaClient, ["AffiliateLink", "AffiliateLinks"]);
  if (!Link || !ids.length) return new Map();

  try {
    const g = await Link.groupBy({ by: ["productId"], where: { productId: { in: ids } }, _count: { productId: true } });
    return new Map(g.map((row) => [row.productId, row._count.productId]));
  } catch {}
  try {
    const g = await Link.groupBy({ by: ["product_id"], where: { product_id: { in: ids } }, _count: { product_id: true } });
    return new Map(g.map((row) => [row.product_id, row._count.product_id]));
  } catch {}
  try {
    const r = await Link.findMany({ where: { productId: { in: ids } }, select: { productId: true } });
    const m = new Map(); for (const x of r) m.set(x.productId, (m.get(x.productId) || 0) + 1); return m;
  } catch {}
  try {
    const r = await Link.findMany({ where: { product_id: { in: ids } }, select: { product_id: true } });
    const m = new Map(); for (const x of r) m.set(x.product_id, (m.get(x.product_id) || 0) + 1); return m;
  } catch {}
  return new Map();
}
async function getMinCommission() {
  try {
    const row = await prisma?.platformConfig?.findFirst?.({ where: { keyName: "min_commission" } });
    const n = Number(row?.value); if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  try {
    const row = await prisma?.platformConfig?.findFirst?.({ where: { key: "min_commission" } });
    const n = Number(row?.value); if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return 5;
}
const pidOf = (p) => p?.product_id ?? p?.id;
function mapProductRow(p, linkCount) {
  return {
    productId: p.product_id ?? p.id,
    productCode: p.product_code ?? p.productCode,
    name: p.name,
    description: p.description || "",
    image_url: p.image_url ?? p.imageUrl,
    merchant_url: p.merchant_url ?? p.merchantUrl,
    price: Number(p.price),
    commissionRate: Number(p.commission_rate ?? p.commissionRate),
    isActive: !!(p.is_active ?? p.isActive),
    activated_by_admin: !!(p.activated_by_admin ?? p.activatedByAdmin),
    totalClicks: Number(p.total_clicks ?? p.totalClicks ?? 0),
    total_purchases: Number(p.total_purchases ?? p.totalPurchases ?? 0),
    max_sales_limit: Number(p.max_sales_limit ?? p.maxSalesLimit ?? 0),
    link_count: Number(linkCount || 0),
    created_at: p.created_at ?? p.createdAt,
  };
}

/* ────────── validation ────────── */
const urlStr = z.string().min(6).max(2048).refine((v) => {
  try { const u = new URL(v); return ["http:", "https:"].includes(u.protocol); } catch { return false; }
}, "invalid_url");

const CreateSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(2000).optional().default(""),
  image_url: urlStr,
  merchant_url: urlStr,
  price: z.union([z.string(), z.number()]),
  commissionRate: z.union([z.string(), z.number()]),
  max_sales_limit: z.union([z.string(), z.number()]),
}).strict();

const PatchSchema = z.object({
  productId: z.union([z.string(), z.number()]),
  action: z.enum(["activate", "deactivate"]).optional(),
  commissionRate: z.union([z.string(), z.number()]).optional(),
  max_sales_limit: z.union([z.string(), z.number()]).optional(),
}).strict();

/* ────────── GET ────────── */
export async function GET(req) {
  const rid = ridOf(req);
  try {
    const { userId } = await requireMerchant();

    const rl = await enforceRate(req, rid, userId, 60);
    if (rl.blocked) return rl.res;

    const Product =
      resolveModel(prisma, ["merchantProduct", "product", "merchantProducts", "products"]) ||
      resolveModel(prisma, ["MerchantProduct", "Product"]);
    if (!Product) {
      const minCommission = await getMinCommission();
      return okJson(rid, { success: true, products: [], minCommission });
    }

    const rows = await findProductsForMerchant(Product, userId);
    const ids = rows.map((r) => pidOf(r)).filter(Boolean);
    const counts = await countLinksByProduct(prisma, ids);

    const products = rows.map((r) => mapProductRow(r, counts.get(pidOf(r)) || 0));
    const minCommission = await getMinCommission();

    return okJson(rid, { success: true, products, minCommission });
  } catch (e) {
    if (DEV) console.error("[merchant_dashboard][GET]", e);
    await audit({ evt: "merchant_dashboard.get.error", requestId: rid, err: String(e?.message || e) });
    const extras = DEV ? { dev_error: String(e?.message || e) } : {};
    const code = e?.code === 401 ? 401 : e?.code === 403 ? 403 : 500;
    return errorJson(rid, code, e?.msg || "server_error", extras);
  }
}

/* ────────── POST ────────── */
export async function POST(req) {
  const rid = ridOf(req);
  const { ip, ua } = ipUaOf(req);
  try {
    const { userId } = await requireMerchant();
    if (!enforceOrigin(req)) return errorJson(rid, 403, "bad_origin");
    if (!validateNextAuthCsrf(req)) return errorJson(rid, 403, "csrf_invalid");

    const rl = await enforceRate(req, rid, userId, 10);
    if (rl.blocked) return rl.res;

    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return errorJson(rid, 400, "invalid_payload");

    const Product =
      resolveModel(prisma, ["merchantProduct", "product", "merchantProducts", "products"]) ||
      resolveModel(prisma, ["MerchantProduct", "Product"]);
    if (!Product) return errorJson(rid, 500, "server_error");

    const minCommission = await getMinCommission();

    const name = sanitize.text((parsed.data.name || "").trim());
    const description = sanitize.text((parsed.data.description || "").trim());
    const image_url = sanitize.text((parsed.data.image_url || "").trim());
    const merchant_url = sanitize.text((parsed.data.merchant_url || "").trim());
    const price = Number(parsed.data.price);
    const commissionRate = Number(parsed.data.commissionRate);

    // REQUIRED & >= 1
    const max_sales_limit = Math.floor(Number(String(parsed.data.max_sales_limit ?? "").trim()));

    if (!Number.isFinite(price) || price <= 0) return errorJson(rid, 400, "invalid_price");
    if (!Number.isFinite(commissionRate) || commissionRate < minCommission || commissionRate > 99.9)
      return errorJson(rid, 400, "invalid_commission");
    if (!Number.isInteger(max_sales_limit) || max_sales_limit < 1) return errorJson(rid, 400, "invalid_limit");

    const created = await prisma.$transaction(async (tx) => {
      const M =
        resolveModel(tx, ["merchantProduct", "product", "merchantProducts", "products"]) ||
        resolveModel(tx, ["MerchantProduct", "Product"]);

      async function createSnake() {
        return await M.create({
          data: {
            merchant_id: userId,
            name, description,
            image_url, merchant_url,
            price,
            commission_rate: commissionRate,
            is_active: true,
            activated_by_admin: false,
            total_clicks: 0,
            total_purchases: 0,
            max_sales_limit,
            product_code: crypto.randomUUID(),
          },
        });
      }
      async function createCamel() {
        return await M.create({
          data: {
            merchantId: userId,
            name, description,
            imageUrl: image_url, merchantUrl: merchant_url,
            price,
            commissionRate,
            isActive: true,
            activatedByAdmin: false,
            totalClicks: 0,
            totalPurchases: 0,
            maxSalesLimit: max_sales_limit,
            productCode: crypto.randomUUID(),
          },
        });
      }

      let product;
      try { product = await createSnake(); } catch { product = await createCamel(); }

      await audit({ who: userId, what: "merchant_product_create", ip, ua, requestId: rid, result: { product_id: pidOf(product) } });
      return product;
    });

    return okJson(rid, { success: true, productId: pidOf(created) });
  } catch (e) {
    if (DEV) console.error("[merchant_dashboard][POST]", e);
    await audit({ evt: "merchant_dashboard.post.error", requestId: rid, err: String(e?.message || e) });
    const extras = DEV ? { dev_error: String(e?.message || e) } : {};
    const code = e?.code === 401 ? 401 : e?.code === 403 ? 403 : 500;
    return errorJson(rid, code, e?.msg || "server_error", extras);
  }
}

/* ────────── PATCH ────────── */
export async function PATCH(req) {
  const rid = ridOf(req);
  const { ip, ua } = ipUaOf(req);
  try {
    const { userId } = await requireMerchant();
    if (!enforceOrigin(req)) return errorJson(rid, 403, "bad_origin");
    if (!validateNextAuthCsrf(req)) return errorJson(rid, 403, "csrf_invalid");

    const rl = await enforceRate(req, rid, userId, 10);
    if (rl.blocked) return rl.res;

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return errorJson(rid, 400, "invalid_payload");

    const Product =
      resolveModel(prisma, ["merchantProduct", "product", "merchantProducts", "products"]) ||
      resolveModel(prisma, ["MerchantProduct", "Product"]);
    if (!Product) return errorJson(rid, 500, "server_error");

    const pid = Number(parsed.data.productId);
    if (!Number.isFinite(pid) || pid <= 0) return errorJson(rid, 400, "invalid_product_id");

    // mevcut kayıt
    let current = null;
    try {
      current = await Product.findFirst({ where: { AND: [{ product_id: pid }, { merchant_id: userId }] } });
    } catch {
      current = await Product.findFirst({ where: { AND: [{ id: pid }, { merchantId: userId }] } });
    }
    if (!current) return errorJson(rid, 404, "not_found");

    const sold = current.total_purchases ?? current.totalPurchases ?? 0;
    let nextCommission = current.commission_rate ?? current.commissionRate;
    let nextLimit = current.max_sales_limit ?? current.maxSalesLimit;

    const minCommission = await getMinCommission();

    // Activate/Deactivate
    if (parsed.data.action) {
      const activate = parsed.data.action === "activate";
      if (activate && sold >= nextLimit) return errorJson(rid, 400, "quota_reached");

      await prisma.$transaction(async (tx) => {
        const M =
          resolveModel(tx, ["merchantProduct", "product", "merchantProducts", "products"]) ||
          resolveModel(tx, ["MerchantProduct", "Product"]);
        try {
          await M.updateMany({ where: { product_id: pid, merchant_id: userId }, data: { is_active: activate } });
        } catch {
          await M.updateMany({ where: { id: pid, merchantId: userId }, data: { isActive: activate } });
        }
        await audit({ who: userId, what: `merchant_product_${activate ? "activate" : "deactivate"}`, ip, ua, requestId: rid, result: { product_id: pid } });
      });

      return okJson(rid, { success: true });
    }

    // Edits
    if (parsed.data.commissionRate !== undefined) {
      const v = Number(parsed.data.commissionRate);
      if (!Number.isFinite(v) || v < minCommission || v > 99.9) return errorJson(rid, 400, "invalid_commission");
      nextCommission = v;
    }
    if (parsed.data.max_sales_limit !== undefined) {
      const v = Math.floor(Number(parsed.data.max_sales_limit));
      if (!Number.isInteger(v) || v < 1) return errorJson(rid, 400, "invalid_limit");
      if (v < sold) return errorJson(rid, 400, "limit_lt_sold");
      nextLimit = v;
    }

    await prisma.$transaction(async (tx) => {
      const M =
        resolveModel(tx, ["merchantProduct", "product", "merchantProducts", "products"]) ||
        resolveModel(tx, ["MerchantProduct", "Product"]);
      try {
        await M.updateMany({ where: { product_id: pid, merchant_id: userId }, data: { commission_rate: nextCommission, max_sales_limit: nextLimit } });
      } catch {
        await M.updateMany({ where: { id: pid, merchantId: userId }, data: { commissionRate: nextCommission, maxSalesLimit: nextLimit } });
      }
      await audit({
        who: userId, what: "merchant_product_update", ip, ua, requestId: rid,
        result: { product_id: pid, commission_rate: nextCommission, max_sales_limit: nextLimit },
      });
    });

    return okJson(rid, { success: true });
  } catch (e) {
    if (DEV) console.error("[merchant_dashboard][PATCH]", e);
    await audit({ evt: "merchant_dashboard.patch.error", requestId: rid, err: String(e?.message || e) });
    const extras = DEV ? { dev_error: String(e?.message || e) } : {};
    const code = e?.code === 401 ? 401 : e?.code === 403 ? 403 : 500;
    return errorJson(rid, code, e?.msg || "server_error", extras);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
