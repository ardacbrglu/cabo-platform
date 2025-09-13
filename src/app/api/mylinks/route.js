export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET: Kullanıcının görünür & süresi geçmemiş linkleri + kullanıcıya özel istatistikler (batched)
 * POST: Seçili linki “My Links”'ten kaldır (isVisible=false)
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { ensureActiveRole } from "@/lib/authz";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

function json(payload, init = {}) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

// Kota kontrolü: maxSalesLimit dolduysa idempotent kapat
async function checkAndDeactivateProduct(p) {
  if (!p) return p;
  const max = typeof p.maxSalesLimit === "number" ? p.maxSalesLimit : null;
  const total = typeof p.totalPurchases === "number" ? p.totalPurchases : null;

  if (p.isActive && max !== null && total !== null && total >= max) {
    await prisma.merchantProduct.update({
      where: { productId: p.productId },
      data: { isActive: false },
    });
    return { ...p, isActive: false };
  }
  return p;
}

/* ───────────── GET ───────────── */
export async function GET(req) {
  try { requireAjax(req); requireOrigin(req); } catch { return json({ error: "bad_request" }, { status: 400 }); }
  try { requireRequestId(req); } catch {}

  // Auth + RBAC (only affiliate)
  const session = await getServerSession(authOptions);
  try { ensureActiveRole(session, ["affiliate"]); } catch { return json({ error: "Unauthorized" }, { status: 401 }); }
  const userId = session.user.id;

  // Rate limit
  const rlKey = makeRateLimitKey(req, { scope: "my-links:get", userId });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  if (!ok) {
    return json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
    );
  }

  try {
    const now = new Date();
    const links = await prisma.affiliateLink.findMany({
      where: {
        userId,
        isVisible: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        linkId: true,
        productId: true,
        token: true,
        isVisible: true,
        expiresAt: true,
        createdAt: true,
        product: {
          select: {
            productId: true,
            isActive: true,
            name: true,
            description: true,
            imageUrl: true,
            price: true,
            commissionRate: true,
            totalClicks: true,
            totalPurchases: true,
            maxSalesLimit: true,
            productCode: true,
            activatedByAdmin: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const linkIds = links.map((l) => l.linkId);
    // Batched: tıklamalar
    const clicksGrouped = linkIds.length
      ? await prisma.click.groupBy({
          by: ["linkId"],
          where: { linkId: { in: linkIds } },
          _count: { _all: true },
        })
      : [];
    const clicksMap = Object.fromEntries(clicksGrouped.map((c) => [c.linkId, c._count._all]));

    // Batched: satış toplamları
    const salesGrouped = linkIds.length
      ? await prisma.affiliateUserSale.groupBy({
          by: ["affiliateLinkId"],
          where: { userId, affiliateLinkId: { in: linkIds } },
          _sum: { commissionAffiliate: true, quantity: true },
        })
      : [];
    const salesMap = Object.fromEntries(
      salesGrouped.map((s) => [
        s.affiliateLinkId,
        {
          qty: Number(s._sum.quantity || 0),
          earn: Number(s._sum.commissionAffiliate || 0),
        },
      ])
    );

    // Kota + alias + sayılarla enrich
    const enriched = await Promise.all(
      links.map(async (link) => {
        const p = link.product;
        let remainingSales = null;
        if (p && typeof p.maxSalesLimit === "number" && typeof p.totalPurchases === "number") {
          remainingSales = Math.max(0, p.maxSalesLimit - p.totalPurchases);
        }
        const maybeClosed = p ? await checkAndDeactivateProduct({ ...p }) : null;
        const prod = maybeClosed || p || null;

        const productWithAliases = prod
          ? {
              ...prod,
              remainingSales,
              remaining_sales: remainingSales,
              image_url: prod.imageUrl,
            }
          : null;

        const c = clicksMap[link.linkId] || 0;
        const s = salesMap[link.linkId] || { qty: 0, earn: 0 };

        return {
          ...link,
          product: productWithAliases,
          user_click_count: c,
          user_sales_count: s.qty,
          user_earnings: s.earn,
        };
      })
    );

    audit({ evt: "mylinks.list.ok", who: userId });
    return json({ links: enriched }, { status: 200 });
  } catch (err) {
    audit({ evt: "mylinks.list.db_error", who: userId, code: err?.code || "DB_ERR" });
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* ───────────── POST (hide) ───────────── */
export async function POST(req) {
  try { requireOrigin(req); requireAjax(req); } catch { return json({ error: "bad_request" }, { status: 400 }); }
  try { requireRequestId(req); } catch {}

  const session = await getServerSession(authOptions);
  try { ensureActiveRole(session, ["affiliate"]); } catch { return json({ error: "Unauthorized" }, { status: 401 }); }
  const userId = session.user.id;

  const rlKey = makeRateLimitKey(req, { scope: "my-links:hide", userId });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  if (!ok) {
    return json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : null;
    const linkId = Number.isFinite(Number(body?.linkId)) ? Number(body.linkId) : null;
    const productId = Number.isFinite(Number(body?.productId)) ? Number(body.productId) : null;

    // Öncelik: linkId → token+productId → sadece token (geri uyum)
    let where;
    if (linkId) {
      where = { linkId, userId, isVisible: true };
    } else if (token && productId) {
      where = { token, productId, userId, isVisible: true };
    } else if (token) {
      where = { token, userId, isVisible: true };
    } else {
      return json({ error: "Missing token" }, { status: 400 });
    }

    const updated = await prisma.affiliateLink.updateMany({
      where,
      data: { isVisible: false },
    });

    if (updated.count === 0) {
      return json({ error: "Link not found or already hidden" }, { status: 404 });
    }

    audit({ evt: "mylinks.hide.ok", who: userId, what: { linkId, productId, token } });
    return json({ success: true }, { status: 200 });
  } catch (err) {
    audit({ evt: "mylinks.hide.db_error", who: userId, code: err?.code || "DB_ERR" });
    return json({ error: "Failed to update link" }, { status: 500 });
  }
}
