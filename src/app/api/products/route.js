export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/products/route.js
 * Purpose: Product Marketplace – aktif ürünleri getir (login zorunlu)
 * Security Docblock:
 * - Auth: NextAuth getServerSession(authOptions) → require status:active & role:affiliate|admin
 * - Headers: Origin/Referer eşleşmesi; X-Requested-With; X-Request-Id (zorunlu)
 * - Ratelimit: GET 60/dk (IP+userId)
 * - Data access: Prisma (raw SQL yok)
 * - Response: no-store + security headers; audit access (PII’siz)
 * - Errors: {error, request_id, retry_after?}
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

export async function GET(req) {
  // Harden preflight
  let requestId = "unknown";
  try {
    requireAjax(req);
    requireOrigin(req);
    requestId = requireRequestId(req);
  } catch {
    return json({ error: "bad_request" }, { status: 400 });
  }

  // Auth (session + RBAC)
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return json({ error: "unauthorized", request_id: requestId }, { status: 401 });
  }
  if (user.status !== "active") {
    return json({ error: "forbidden_status", request_id: requestId }, { status: 403 });
  }
  if (user.role !== "affiliate" && user.role !== "admin") {
    return json({ error: "forbidden_role", request_id: requestId }, { status: 403 });
  }

  // Rate limit: GET 60/dk
  const rlKey = makeRateLimitKey(req, { scope: "products_get", userId: user.id });
  const { ok, resetMs } = await checkRateLimit({
    key: rlKey,
    limit: 60,
    windowMs: 60_000,
  });
  if (!ok) {
    return json(
      { error: "rate_limited", request_id: requestId, retry_after: Math.ceil((resetMs || 0) / 1000) },
      { status: 429 }
    );
  }

  try {
    // ŞEMA: MerchantProduct camelCase alanlar
    const productsRaw = await prisma.merchantProduct.findMany({
      where: { isActive: true, activatedByAdmin: true },
      select: {
        productId: true,
        name: true,
        description: true,
        imageUrl: true,
        merchantUrl: true,
        commissionRate: true, // Decimal
        price: true,          // Decimal?
        totalClicks: true,
        totalPurchases: true,
        createdAt: true,
        maxSalesLimit: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const productIds = productsRaw.map((p) => p.productId);

    // ŞEMA: AffiliateLink camelCase alanlar
    const linksRaw = productIds.length
      ? await prisma.affiliateLink.findMany({
          where: { userId: user.id, productId: { in: productIds } },
          select: { productId: true, token: true, isVisible: true, expiresAt: true },
        })
      : [];

    // Response camelCase (frontend ile uyumlu)
    const products = productsRaw.map((p) => ({
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
      isActive: true, // zaten filtrede aktif
      maxSalesLimit: p.maxSalesLimit ?? null,
    }));

    const userLinks = linksRaw.map((l) => ({
      productId: l.productId,
      token: l.token,
      isVisible: !!l.isVisible,
      expiresAt: l.expiresAt?.toISOString?.() || null,
    }));

    const visibleLinkIds = userLinks.filter((l) => l.isVisible).map((l) => l.productId);

    audit({ evt: "products.list.ok", who: user.id, requestId });
    return json({ ok: true, products, userLinks, visibleLinkIds, request_id: requestId }, { status: 200 });
  } catch (e) {
    audit({ evt: "products.list.db_error", code: e?.code || "DB_ERR", requestId });
    return json({ error: "server_error", request_id: requestId }, { status: 500 });
  }
}
