export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Product Marketplace — Aktif ürünler (FIXED: expires alignment)
 *
 * Security Docblock (Cabo PROD):
 * - requireOrigin + requireAjax + requireRequestId
 * - NextAuth session + RBAC + status gates
 * - Rate limit (GET 60/dk)
 * - No-store + security headers
 * - Error contract: { error, request_id, retry_after? }
 *
 * Fix:
 * - Products sayfasında "Added" sadece link isVisible && (expiresAt null || expiresAt > now) ise true.
 * - Böylece My Links ile 1:1 tutarlılık sağlanır.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";

import { applyApiSecurityHeaders } from "@/lib/headers";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireAjax, requireOrigin, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

function addParam(u, k, v) {
  if (!u.searchParams.has(k)) u.searchParams.set(k, String(v));
}

function isLinkActiveForMyLinks(link, now) {
  if (!link?.isVisible) return false;
  if (!link.expiresAt) return true;
  return link.expiresAt > now;
}

export async function GET(req) {
  let requestId = "unknown";
  try {
    requireAjax(req);
    requireOrigin(req);
    requestId = requireRequestId(req);
  } catch {
    return json({ error: "bad_request", request_id: requestId }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return json({ error: "unauthorized", request_id: requestId }, { status: 401 });
  if (user.status !== "active") return json({ error: "forbidden_status", request_id: requestId }, { status: 403 });
  if (user.role !== "affiliate" && user.role !== "admin") {
    return json({ error: "forbidden_role", request_id: requestId }, { status: 403 });
  }

  // Rate limit
  const rlKey = makeRateLimitKey(req, { scope: "products_get", userId: user.id });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  if (!ok) {
    return json(
      { error: "rate_limited", request_id: requestId, retry_after: Math.ceil((resetMs || 0) / 1000) },
      { status: 429 }
    );
  }

  try {
    const now = new Date();

    const productsRaw = await prisma.merchantProduct.findMany({
      where: { isActive: true, activatedByAdmin: true },
      select: {
        productId: true,
        name: true,
        description: true,
        imageUrl: true,
        merchantUrl: true,
        commissionRate: true,
        price: true,
        totalClicks: true,
        totalPurchases: true,
        createdAt: true,
        maxSalesLimit: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const productIds = productsRaw.map((p) => p.productId);

    const linksRaw = productIds.length
      ? await prisma.affiliateLink.findMany({
          where: { userId: user.id, productId: { in: productIds } },
          select: { productId: true, token: true, isVisible: true, expiresAt: true, linkId: true, createdAt: true },
        })
      : [];

    // Map: productId -> link info
    const linkMap = new Map(
      linksRaw.map((l) => [
        l.productId,
        {
          token: l.token,
          linkId: l.linkId,
          isVisible: !!l.isVisible,
          expiresAt: l.expiresAt,
          createdAt: l.createdAt,
        },
      ])
    );

    const products = productsRaw.map((p) => {
      let shareUrl = null;

      const info = linkMap.get(p.productId);
      const activeForMyLinks = isLinkActiveForMyLinks(info, now);

      if (activeForMyLinks) {
        try {
          const u = new URL(p.merchantUrl);
          addParam(u, "token", info.token);
          addParam(u, "lid", info.linkId);
          shareUrl = u.toString();
        } catch {
          shareUrl = null;
        }
      }

      return {
        productId: p.productId,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        merchantUrl: p.merchantUrl,
        commissionRate: p.commissionRate != null ? Number(p.commissionRate) : 0,
        price: p.price != null ? Number(p.price) : null,
        totalClicks: p.totalClicks ?? 0,
        totalPurchases: p.totalPurchases ?? 0,
        createdAt: p.createdAt?.toISOString?.() || null,
        isActive: true,
        maxSalesLimit: p.maxSalesLimit ?? null,
        shareUrl, // yalnızca "My Links'te görünecek" linkler için gelir
      };
    });

    // userLinks (frontend’in opsiyonel kullanımı için)
    const userLinks = linksRaw.map((l) => ({
      productId: l.productId,
      token: l.token,
      isVisible: !!l.isVisible,
      expiresAt: l.expiresAt?.toISOString?.() || null,
      linkId: l.linkId,
      createdAt: l.createdAt?.toISOString?.() || null,
      isActiveForMyLinks: isLinkActiveForMyLinks(l, now),
    }));

    // ✅ visibleLinkIds artık My Links ile aynı semantik
    const visibleLinkIds = userLinks.filter((l) => l.isActiveForMyLinks).map((l) => l.productId);

    audit({ evt: "products.list.ok", who: user.id, requestId });
    return json({ ok: true, products, userLinks, visibleLinkIds, request_id: requestId }, { status: 200 });
  } catch (e) {
    audit({ evt: "products.list.db_error", code: e?.code || "DB_ERR", requestId });
    return json({ error: "server_error", request_id: requestId }, { status: 500 });
  }
}
