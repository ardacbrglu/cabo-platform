export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/mylinks/route.js
 * Purpose:
 *  - GET: Kullanıcının görünür ve (varsa) süresi geçmemiş linkleri + kullanıcıya özel istatistikler
 *  - POST: Bir linki “My Links” görünümünden kaldırır (isVisible=false)
 *
 * Security:
 *  - Auth: NextAuth (getServerSession) + ensureActiveRole(["affiliate"])  // RBAC: only affiliate
 *  - CSRF: YOK (JSON API’de Origin/Referer + X-Requested-With zorunlu)
 *  - Rate limit: GET 60/dk, POST 20/dk (IP+userId)
 *  - SameSite cookies + same-origin fetch (credentials:'include')
 *  - Headers: X-Request-Id önerilir (isteğe bağlı)
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
  // same-origin GET sertleştirme (frontend apiFetch zaten header’ları ekliyor)
  try {
    requireAjax(req);
    requireOrigin(req);
  } catch {
    return json({ error: "bad_request" }, { status: 400 });
  }
  // opsiyonel: request id doğrulama (zorunlu değil)
  try { requireRequestId(req); } catch {}

  // Auth + RBAC (only affiliate)
  const session = await getServerSession(authOptions);
  try {
    ensureActiveRole(session, ["affiliate"]);
  } catch {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
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

    // Kalan kota + olası idempotent kapatma
    const withQuota = await Promise.all(
      links.map(async (link) => {
        const p = link.product;
        let remainingSales = null;
        if (p && typeof p.maxSalesLimit === "number" && typeof p.totalPurchases === "number") {
          remainingSales = Math.max(0, p.maxSalesLimit - p.totalPurchases);
        }
        const maybeClosed = p
          ? await checkAndDeactivateProduct({
              ...p,
              // checkAndDeactivateProduct beklediği alanlar zaten camelCase
            })
          : null;

        return {
          ...link,
          product: maybeClosed ? { ...p, ...maybeClosed, remainingSales } : p ? { ...p, remainingSales } : null,
        };
      })
    );

    // Kullanıcıya özel sayımlar
    const enriched = await Promise.all(
      withQuota.map(async (link) => {
        const user_click_count = await prisma.click.count({ where: { linkId: link.linkId } });

        const salesAgg = await prisma.affiliateUserSale.aggregate({
          _sum: { commissionAffiliate: true, quantity: true },
          where: { affiliateLinkId: link.linkId, userId },
        });

        return {
          ...link,
          user_click_count,
          user_sales_count: Number(salesAgg._sum.quantity) || 0,
          user_earnings: Number(salesAgg._sum.commissionAffiliate) || 0,
        };
      })
    );

    // ── GERİYE UYUMLU ŞEKİL ──
    // Eski frontend { links: [...] } bekliyordu → onu koruyoruz.
    // (Ürün alanları camelCase; istersen eski snake_case alias’larını ekleyebiliriz.)
    audit({ evt: "mylinks.list.ok", who: userId });
    return json({ links: enriched }, { status: 200 });
  } catch (err) {
    audit({ evt: "mylinks.list.db_error", who: userId, code: err?.code || "DB_ERR" });
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* ───────────── POST (hide) ───────────── */
export async function POST(req) {
  // CSRF yok; same-origin zorunluluğu
  try {
    requireOrigin(req);
    requireAjax(req);
  } catch {
    return json({ error: "bad_request" }, { status: 400 });
  }
  try { requireRequestId(req); } catch {}

  const session = await getServerSession(authOptions);
  try {
    ensureActiveRole(session, ["affiliate"]);
  } catch {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Rate limit
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
    const token = body?.token;
    if (!token || typeof token !== "string") {
      return json({ error: "Missing token" }, { status: 400 });
    }

    const updated = await prisma.affiliateLink.updateMany({
      where: { token, userId, isVisible: true },
      data: { isVisible: false },
    });

    if (updated.count === 0) {
      return json({ error: "Link not found or already hidden" }, { status: 404 });
    }

    audit({ evt: "mylinks.hide.ok", who: userId, what: { token } });
    return json({ success: true }, { status: 200 });
  } catch (err) {
    audit({ evt: "mylinks.hide.db_error", who: userId, code: err?.code || "DB_ERR" });
    return json({ error: "Failed to update link" }, { status: 500 });
  }
}
