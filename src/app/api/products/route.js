export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/products/route.js
 * Purpose: Product Marketplace – aktif ürünleri getir (login zorunlu)
 * Security Docblock:
 * - Auth: NextAuth getServerSession(authOptions) → require status:active & role:affiliate
 * - Headers: X-Requested-With, X-Request-Id önerilir; response no-store + security headers
 * - Ratelimit: GET 60/dk (IP+userId)
 * - Data validation: none (pure GET); DB only via Prisma
 * - Audit: access log (PII siz)
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
  try {
    requireAjax(req);
    requireOrigin(req);
    requireRequestId(req);
  } catch {
    // GET’te çok sert dönmeyelim, generic fail
    return json({ error: "bad_request" }, { status: 400 });
  }

  // Auth (session + RBAC)
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.status !== "active") {
    return json({ error: "forbidden_status" }, { status: 403 });
  }
  if (user.role !== "affiliate" && user.role !== "admin") {
    return json({ error: "forbidden_role" }, { status: 403 });
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
      { error: "rate_limited", retry_after: Math.ceil((resetMs || 0) / 1000) },
      { status: 429 }
    );
  }

  try {
    // Aktif + admin onaylı ürünler
    const products = await prisma.merchantProduct.findMany({
      where: { is_active: true, activated_by_admin: true },
      select: {
        product_id: true,
        name: true,
        description: true,
        image_url: true,
        merchant_url: true,
        commission_rate: true,
        price: true,
        total_clicks: true,
        total_purchases: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    // Kullanıcının mevcut (görünür) linkleri – claim edilmiş mi?
    const pIds = products.map((p) => p.product_id);
    const links = await prisma.affiliateLink.findMany({
      where: { user_id: user.id, product_id: { in: pIds }, is_visible: true },
      select: { product_id: true, token: true, created_at: true },
    });
    const map = new Map(links.map((l) => [l.product_id, l]));

    const data = products.map((p) => ({
      ...p,
      added: map.has(p.product_id),
      token: map.get(p.product_id)?.token || null,
    }));

    audit({ evt: "products.list.ok", who: user.id });
    return json({ ok: true, items: data }, { status: 200 });
  } catch (e) {
    audit({ evt: "products.list.db_error", code: e?.code || "DB_ERR" });
    return json({ error: "server_error" }, { status: 500 });
  }
}
