// src/app/api/merchant_dashboard/route.js
/**
 * Security Docblock
 * - requireSession; requireStatus('active'); requireRole('merchant')
 * - GET: 60/min (IP+userId); PATCH/POST: 10/min
 * - Mutations: Origin/Host/Referer match + X-Requested-With + X-Request-Id (+ optional X-CSRF-Token)
 * - Audit all mutations; JSON contract {error, request_id, retry_after?}
 * - Prisma only; no raw SQL
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import crypto from "node:crypto";
import { requireMerchant } from "@/lib/guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEV = process.env.NODE_ENV !== "production";

/* ───────── utils ───────── */
const ridOf = (req) =>
  req.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();
const withSec = (res, rid) => {
  applyApiSecurityHeaders(res);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Request-Id", rid);
  return res;
};
const errorJson = (rid, status, message, extra = {}) =>
  withSec(NextResponse.json({ error: message, request_id: rid, ...extra }, { status }), rid);
const okJson = (rid, data, init = {}) => withSec(NextResponse.json(data, init), rid);

const sanitizeText = (v) =>
  (typeof v === "string" ? v : String(v ?? ""))
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();

// CSRF optional — if header absent it's considered OK, otherwise must match cookie
function validateNextAuthCsrf(req) {
  const headerToken = req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
  if (!headerToken) return true;
  const m = (req.headers.get("cookie") || "").match(
    /(?:^|;\s*)(?:__Host-)?next-auth\.csrf-token=([^;]+)/i
  );
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
    [host, envUrl]
      .filter(Boolean)
      .map((u) => {
        try {
          return new URL(u.startsWith("http") ? u : `https://${u}`).host;
        } catch {
          return u;
        }
      })
  );
  const ok = (u) => {
    try {
      return !u || allowed.has(new URL(u).host);
    } catch {
      return false;
    }
  };
  return ok(origin) && ok(referer);
}

async function rateLimitAnyShape({ key, limit, windowMs }) {
  try {
    const r = await checkRateLimit({ key, limit, windowMs });
    return {
      ok: r?.ok ?? r?.allowed ?? true,
      resetMs: r?.resetMs ?? (r?.retryAfterSec ? r.retryAfterSec * 1000 : windowMs),
    };
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

async function parseBody(req) {
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  try {
    if (ctype.includes("application/json")) return (await req.json()) ?? {};
    if (ctype.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    }
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const obj = {};
      for (const [k, v] of form.entries()) obj[k] = typeof v === "string" ? v : (v?.name || "blob");
      return obj;
    }
    const txt = await req.text();
    try {
      return JSON.parse(txt);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

/* ───────── prisma helpers ───────── */
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
    { where: { ownerId: userId }, orderBy: { createdAt: "desc" } },
  ];
  for (const t of tries) {
    try {
      return await Product.findMany(t);
    } catch {}
  }
  try {
    return await Product.findMany({ take: 500 });
  } catch {
    return [];
  }
}
async function countLinksByProduct(prismaClient, ids) {
  if (!ids.length) return new Map();
  const Link =
    resolveModel(prismaClient, ["affiliateLink", "affiliateLinks"]) ||
    resolveModel(prismaClient, ["AffiliateLink", "AffiliateLinks"]);
  if (!Link) return new Map();
  try {
    const g = await Link.groupBy({
      by: ["productId"],
      where: { productId: { in: ids } },
      _count: { productId: true },
    });
    return new Map(g.map((row) => [row.productId, row._count.productId]));
  } catch {}
  try {
    const r = await Link.findMany({
      where: { productId: { in: ids } },
      select: { productId: true },
    });
    const m = new Map();
    for (const x of r) m.set(x.productId, (m.get(x.productId) || 0) + 1);
    return m;
  } catch {}
  return new Map();
}
async function getMinCommission() {
  try {
    const row = await prisma.platformConfig.findFirst({
      where: { keyName: "min_commission" },
      select: { value: true },
    });
    const n = Number(row?.value);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return 5;
}
const pidOf = (p) => p?.productId ?? p?.product_id ?? p?.id;

function mapProductRow(p, linkCount) {
  return {
    productId: p.productId ?? p.product_id ?? p.id,
    productCode: p.productCode ?? p.product_code,
    name: p.name,
    description: p.description || "",
    image_url: p.imageUrl ?? p.image_url,
    merchant_url: p.merchantUrl ?? p.merchant_url,
    price: Number(p.price),
    commissionRate: Number(p.commissionRate ?? p.commission_rate),
    isActive: !!(p.isActive ?? p.is_active),
    activated_by_admin: !!(p.activatedByAdmin ?? p.activated_by_admin),
    totalClicks: Number(p.totalClicks ?? p.total_clicks ?? 0),
    total_purchases: Number(p.totalPurchases ?? p.total_purchases ?? 0),
    max_sales_limit: Number(p.maxSalesLimit ?? p.max_sales_limit ?? 0),
    link_count: Number(linkCount || 0),
    created_at: p.createdAt ?? p.created_at,
  };
}

/* ───────── validators ───────── */
function isSafeImageUrl(s, maxBytes = 2 * 1024 * 1024) {
  if (!s) return false;
  if (s.startsWith("data:image/")) {
    const m = s.match(/^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!m) return false;
    try {
      const buf = Buffer.from(m[2], "base64");
      return buf.length > 0 && buf.length <= maxBytes;
    } catch {
      return false;
    }
  }
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
const httpUrl = z
  .string()
  .min(6)
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return ["http:", "https:"].includes(u.protocol);
    } catch {
      return false;
    }
  }, "invalid_url");

const CreateSchema = z
  .object({
    name: z.string().min(3).max(120),
    description: z.string().max(2000).optional().default(""),
    image_url: z.string().min(10).refine((v) => isSafeImageUrl(v), "invalid_image_url"),
    merchant_url: httpUrl,
    price: z.union([z.string(), z.number()]),
    commissionRate: z.union([z.string(), z.number()]),
    max_sales_limit: z.union([z.string(), z.number()]),
  })
  .strict();

const PatchSchema = z
  .object({
    productId: z.union([z.string(), z.number()]),
    action: z.enum(["activate", "deactivate"]).optional(),
    name: z.string().min(3).max(120).optional(),
    description: z.string().max(2000).optional(),
    image_url: z.string().refine((v) => isSafeImageUrl(v), "invalid_image_url").optional(),
    merchant_url: httpUrl.optional(),
    price: z.union([z.string(), z.number()]).optional(),
    commissionRate: z.union([z.string(), z.number()]).optional(),
    max_sales_limit: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

/* ───────── GET ───────── */
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
    await audit({
      evt: "merchant_dashboard.get.error",
      requestId: rid,
      err: String(e?.message || e),
    });
    const extras = DEV ? { dev_error: String(e?.message || e) } : {};
    const code = e?.code === 401 ? 401 : e?.code === 403 ? 403 : 500;
    return errorJson(rid, code, e?.msg || "server_error", extras);
  }
}

/* ───────── POST ───────── */
export async function POST(req) {
  const rid = ridOf(req);
  try {
    const { userId } = await requireMerchant();
    if (!enforceOrigin(req)) return errorJson(rid, 403, "bad_origin");
    if (!validateNextAuthCsrf(req)) return errorJson(rid, 403, "csrf_invalid");

    const rl = await enforceRate(req, rid, userId, 10);
    if (rl.blocked) return rl.res;

    const body = await parseBody(req);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return DEV
        ? errorJson(rid, 400, "invalid_payload", { validation: parsed.error.flatten() })
        : errorJson(rid, 400, "invalid_payload");
    }

    const Product =
      resolveModel(prisma, ["merchantProduct", "product", "merchantProducts", "products"]) ||
      resolveModel(prisma, ["MerchantProduct", "Product"]);
    if (!Product) return errorJson(rid, 500, "server_error");

    const minCommission = await getMinCommission();

    const name = sanitizeText(parsed.data.name || "");
    const description = sanitizeText(parsed.data.description || "");
    const image_url = sanitizeText(parsed.data.image_url || "");
    const merchant_url = sanitizeText(parsed.data.merchant_url || "");
    const price = Number(parsed.data.price);
    const commissionRate = Number(parsed.data.commissionRate);
    const max_sales_limit = Math.floor(Number(String(parsed.data.max_sales_limit ?? "").trim()));

    if (!Number.isFinite(price) || price <= 0) return errorJson(rid, 400, "invalid_price");
    if (!Number.isFinite(commissionRate) || commissionRate < minCommission || commissionRate > 99.9)
      return errorJson(rid, 400, "invalid_commission");
    if (!Number.isInteger(max_sales_limit) || max_sales_limit < 1)
      return errorJson(rid, 400, "invalid_limit");
    if (!isSafeImageUrl(image_url)) return errorJson(rid, 400, "invalid_image_url");

    const created = await prisma.$transaction(async (tx) => {
      const M =
        resolveModel(tx, ["merchantProduct", "product", "merchantProducts", "products"]) ||
        resolveModel(tx, ["MerchantProduct", "Product"]);
      let product;
      try {
        product = await M.create({
          data: {
            merchantId: userId,
            name,
            description,
            imageUrl: image_url,
            merchantUrl: merchant_url,
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
      } catch {
        product = await M.create({
          data: {
            merchant_id: userId,
            name,
            description,
            image_url,
            merchant_url,
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
      await audit({
        who: userId,
        what: "merchant_product_create",
        requestId: rid,
        result: { product_id: pidOf(product) },
      });
      return product;
    });

    return okJson(rid, { success: true, productId: pidOf(created) });
  } catch (e) {
    if (DEV) console.error("[merchant_dashboard][POST]", e);
    await audit({
      evt: "merchant_dashboard.post.error",
      requestId: rid,
      err: String(e?.message || e),
    });
    const extras = DEV ? { dev_error: String(e?.message || e) } : {};
    const code = e?.code === 401 ? 401 : e?.code === 403 ? 403 : 500;
    return errorJson(rid, code, e?.msg || "server_error", extras);
  }
}

/* ───────── PATCH ───────── */
export async function PATCH(req) {
  const rid = ridOf(req);
  try {
    const { userId } = await requireMerchant();
    if (!enforceOrigin(req)) return errorJson(rid, 403, "bad_origin");
    if (!validateNextAuthCsrf(req)) return errorJson(rid, 403, "csrf_invalid");

    const rl = await enforceRate(req, rid, userId, 10);
    if (rl.blocked) return rl.res;

    const body = await parseBody(req);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return DEV
        ? errorJson(rid, 400, "invalid_payload", { validation: parsed.error.flatten() })
        : errorJson(rid, 400, "invalid_payload");
    }

    const Product =
      resolveModel(prisma, ["merchantProduct", "product", "merchantProducts", "products"]) ||
      resolveModel(prisma, ["MerchantProduct", "Product"]);
    if (!Product) return errorJson(rid, 500, "server_error");

    const pid = Number(parsed.data.productId);
    if (!Number.isFinite(pid) || pid <= 0) return errorJson(rid, 400, "invalid_product_id");

    // current row
    let current = null;
    try {
      current = await Product.findFirst({ where: { AND: [{ productId: pid }, { merchantId: userId }] } });
    } catch {}
    if (!current) {
      try {
        current = await Product.findFirst({ where: { AND: [{ product_id: pid }, { merchant_id: userId }] } });
      } catch {}
    }
    if (!current) return errorJson(rid, 404, "not_found");

    // ACTIVATE/DEACTIVATE
    if (parsed.data.action) {
      const activate = parsed.data.action === "activate";
      const sold = current.totalPurchases ?? current.total_purchases ?? 0;
      const limit = current.maxSalesLimit ?? current.max_sales_limit ?? 0;
      if (activate && sold >= limit) return errorJson(rid, 400, "quota_reached");

      const camelWhere = { productId: pid, merchantId: userId };
      const snakeWhere = { product_id: pid, merchant_id: userId };
      let updated = 0;
      try {
        const r = await Product.updateMany({ where: camelWhere, data: { isActive: activate } });
        updated = r?.count ?? 0;
      } catch {
        const r = await Product.updateMany({ where: snakeWhere, data: { is_active: activate } });
        updated = r?.count ?? 0;
      }
      await audit({
        who: userId,
        what: `merchant_product_${activate ? "activate" : "deactivate"}`,
        requestId: rid,
        result: { product_id: pid, updated },
      });
      return okJson(rid, { success: true });
    }

    const minCommission = await getMinCommission();

    const curr = {
      name: current.name,
      description: current.description || "",
      image_url: current.imageUrl ?? current.image_url,
      merchant_url: current.merchantUrl ?? current.merchant_url,
      price: Number(current.price),
      commissionRate: Number(current.commissionRate ?? current.commission_rate),
      max_sales_limit: Number(current.maxSalesLimit ?? current.max_sales_limit),
      sold: Number(current.totalPurchases ?? current.total_purchases ?? 0),
    };

    const updates = {};
    const updatesSnake = {};
    const pushBoth = (camelKey, snakeKey, val) => {
      updates[camelKey] = val;
      updatesSnake[snakeKey] = val;
    };

    if (parsed.data.name !== undefined) {
      const v = sanitizeText(parsed.data.name);
      if (v.length < 3 || v.length > 120) return errorJson(rid, 400, "invalid_name");
      pushBoth("name", "name", v);
    }
    if (parsed.data.description !== undefined) {
      const v = sanitizeText(parsed.data.description);
      if (v.length > 2000) return errorJson(rid, 400, "invalid_description");
      pushBoth("description", "description", v);
    }
    if (parsed.data.image_url !== undefined) {
      const v = sanitizeText(parsed.data.image_url);
      if (!isSafeImageUrl(v)) return errorJson(rid, 400, "invalid_image_url");
      pushBoth("imageUrl", "image_url", v);
    }
    if (parsed.data.merchant_url !== undefined) {
      const v = sanitizeText(parsed.data.merchant_url);
      try {
        const u = new URL(v);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      } catch {
        return errorJson(rid, 400, "invalid_url");
      }
      pushBoth("merchantUrl", "merchant_url", v);
    }
    if (parsed.data.price !== undefined) {
      const v = Number(parsed.data.price);
      if (!Number.isFinite(v) || v <= 0) return errorJson(rid, 400, "invalid_price");
      pushBoth("price", "price", v);
    }

    let approvalReset = false;
    if (parsed.data.commissionRate !== undefined) {
      const v = Number(parsed.data.commissionRate);
      if (!Number.isFinite(v) || v < minCommission || v > 99.9)
        return errorJson(rid, 400, "invalid_commission");
      if (v !== curr.commissionRate) approvalReset = true;
      pushBoth("commissionRate", "commission_rate", v);
    }
    if (parsed.data.max_sales_limit !== undefined) {
      const v = Math.floor(Number(parsed.data.max_sales_limit));
      if (!Number.isInteger(v) || v < 1) return errorJson(rid, 400, "invalid_limit");
      if (v < curr.sold) return errorJson(rid, 400, "limit_lt_sold");
      if (v !== curr.max_sales_limit) approvalReset = true;
      pushBoth("maxSalesLimit", "max_sales_limit", v);
    }

    if (Object.keys(updates).length === 0) return okJson(rid, { success: true, noop: true });

    if (approvalReset) {
      updates.activatedByAdmin = false;
      updatesSnake.activated_by_admin = false;
      updates.isActive = false;
      updatesSnake.is_active = false;
    }

    const camelWhere = { productId: pid, merchantId: userId };
    const snakeWhere = { product_id: pid, merchant_id: userId };
    try {
      await Product.updateMany({ where: camelWhere, data: updates });
    } catch {
      await Product.updateMany({ where: snakeWhere, data: updatesSnake });
    }
    await audit({
      who: userId,
      what: "merchant_product_update",
      requestId: rid,
      result: { product_id: pid, approval_reset: approvalReset, updates: Object.keys(updates) },
    });

    return okJson(rid, { success: true, approval_reset: approvalReset });
  } catch (e) {
    if (DEV) console.error("[merchant_dashboard][PATCH]", e);
    await audit({
      evt: "merchant_dashboard.patch.error",
      requestId: rid,
      err: String(e?.message || e),
    });
    const extras = DEV ? { dev_error: String(e?.message || e) } : {};
    const code = e?.code === 401 ? 401 : e?.code === 403 ? 403 : 500;
    return errorJson(rid, code, e?.msg || "server_error", extras);
  }
}
