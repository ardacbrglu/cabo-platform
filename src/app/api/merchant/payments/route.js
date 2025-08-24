export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Merchant Payouts API (camelCase Prisma schema)
 * GET   -> grouped list (by requestId+affiliate)
 * PATCH -> mark selected payout items as merchant_paid
 * Security: requireMerchant(), NextAuth CSRF (double submit) for PATCH, origin check,
 *           rate limits (GET 30/min, PATCH 10/min), secure headers.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { checkRateLimit } from "@/lib/ratelimit";
import { requireMerchant } from "@/lib/guards";
import { z } from "zod";
import crypto from "node:crypto";

const DEV = process.env.NODE_ENV !== "production";

/* utils */
const ridOf = (req) =>
  req.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();

const withSec = (res, rid) => {
  applyApiSecurityHeaders(res);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Request-Id", rid);
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
};
const ok = (rid, data, init = {}) => withSec(NextResponse.json(data, init), rid);
const err = (rid, status, msg, extra = {}) =>
  withSec(NextResponse.json({ error: msg, ...extra }, { status }), rid);

function validateNextAuthCsrf(req) {
  const headerToken =
    req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
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
  const allowedHosts = new Set([host].filter(Boolean));
  const okh = (u) => {
    try {
      return !u || allowedHosts.has(new URL(u).host);
    } catch {
      return false;
    }
  };
  return okh(origin) && okh(referer);
}

const statusPriority = {
  platform_confirmed: 3,
  merchant_paid: 2,
  pending: 1,
  rejected: 0,
};

/* ───────────── GET: list ───────────── */
export async function GET(req) {
  const rid = ridOf(req);
  try {
    const { userId } = await requireMerchant();

    // rate limit 30/min
    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0] || "0.0.0.0";
    const key = `api:payouts:get:${userId}:${ip}`;
    const rl = await checkRateLimit({ key, limit: 30, windowMs: 60_000 });
    if (rl && rl.ok === false) {
      const retry = Math.ceil((rl.resetMs || 60_000) / 1000);
      const r = err(rid, 429, "rate_limited");
      r.headers.set("Retry-After", String(retry));
      return r;
    }

    // pagination
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(searchParams.get("limit") || "100", 10) || 100)
    );
    const offset = (page - 1) * limit;

    // ✅ Prisma şeması camelCase: yalnız camel alanları kullan
    const rows = await prisma.payoutRequestItem.findMany({
      where: {
        merchantId: userId,
        status: {
          in: ["pending", "merchant_paid", "platform_confirmed", "rejected"],
        },
      },
      select: {
        itemId: true,
        requestId: true,
        amount: true,
        status: true,
        createdAt: true,
        payoutRequest: {
          select: {
            userId: true,
            realUserFullname: true,
            requestedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // group by affiliate+request
    const grouped = new Map();
    for (const it of rows) {
      const reqId = it.requestId;
      const affId = it.payoutRequest?.userId;
      const key = `${affId}_${reqId}`;
      const amount = Number(it.amount || 0);
      const status = String(it.status || "pending");

      if (!grouped.has(key)) {
        grouped.set(key, {
          itemIds: [],
          requestId: reqId,
          affiliate_id: affId,
          affiliate_name: it.payoutRequest?.realUserFullname || "",
          amount: 0,
          status: "pending",
          requested_at: it.payoutRequest?.requestedAt || null, // UI snake bekliyor
        });
      }
      const g = grouped.get(key);
      g.itemIds.push(it.itemId);
      g.amount += amount;
      if (statusPriority[status] > statusPriority[g.status]) g.status = status;
    }

    const arr = Array.from(grouped.values());
    const totalCount = arr.length;
    const pageItems = arr.slice(offset, offset + limit);

    return ok(rid, {
      items: pageItems,
      total: totalCount,
      page,
      pageCount: Math.ceil(totalCount / limit),
    });
  } catch (e) {
    if (DEV) console.error("[payouts][GET]", e);
    return err(rid, 500, "server_error");
  }
}

/* ───────────── PATCH: mark as paid ───────────── */
const PatchSchema = z
  .object({
    itemIds: z
      .array(
        z
          .union([
            z.number().int().positive(),
            z.string().regex(/^\d+$/).transform((s) => Number(s)),
          ])
          .refine((n) => Number.isInteger(n) && n > 0)
      )
      .min(1)
      .max(200),
  })
  .strict();

export async function PATCH(req) {
  const rid = ridOf(req);
  try {
    const { userId } = await requireMerchant();
    if (!enforceOrigin(req)) return err(rid, 403, "bad_origin");
    if (!validateNextAuthCsrf(req)) return err(rid, 403, "csrf_invalid");

    // rate limit 10/min
    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0] || "0.0.0.0";
    const key = `api:payouts:patch:${userId}:${ip}`;
    const rl = await checkRateLimit({ key, limit: 10, windowMs: 60_000 });
    if (rl && rl.ok === false) {
      const retry = Math.ceil((rl.resetMs || 60_000) / 1000);
      const r = err(rid, 429, "rate_limited");
      r.headers.set("Retry-After", String(retry));
      return r;
    }

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return err(rid, 400, "invalid_payload");
    const ids = parsed.data.itemIds;

    // ✅ sadece camelCase alanlar
    const eligible = await prisma.payoutRequestItem.findMany({
      where: {
        merchantId: userId,
        status: "pending",
        itemId: { in: ids },
        payoutRequest: { status: "pending" },
      },
      select: { itemId: true, requestId: true },
    });

    if (!eligible.length) return err(rid, 400, "no_valid_items");

    const itemIds = eligible.map((e) => e.itemId);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.payoutRequestItem.updateMany({
        where: { itemId: { in: itemIds } },
        data: { status: "merchant_paid", paidAt: now },
      });

      // log tablosu varsa yaz, yoksa geç
      try {
        await tx.payoutRequestLog.createMany({
          data: eligible.map((e) => ({
            itemId: e.itemId,
            requestId: e.requestId,
            action: "merchant_paid",
            oldStatus: "pending",
            newStatus: "merchant_paid",
            note: "Merchant marked as paid",
            createdAt: now,
          })),
        });
      } catch {
        // optional
      }
    });

    return ok(rid, { success: true, updated: itemIds, count: itemIds.length });
  } catch (e) {
    if (DEV) console.error("[payouts][PATCH]", e);
    return err(rid, 500, "server_error");
  }
}
