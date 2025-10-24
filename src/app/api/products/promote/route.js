export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Product Promote — "Get my link"
 * - Kullanıcının seçtiği ürüne ait affiliate link kaydını görünür hale getirir veya oluşturur.
 * - Token artık global-unique değil (merchant-reuse); benzersizlik linkId iledir.
 * - Dönüşte:
 *    - token
 *    - linkId
 *    - expiresAt
 *    - shareUrl  => product.merchantUrl + ?token=...&lid=...
 * Güvenlik:
 *  - requireOrigin + requireAjax + requireRequestId
 *  - NextAuth session + RBAC + status kapıları
 *  - Rate limit (10/dk)
 *  - No-store + güvenli başlıklar
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { z } from "zod";
import crypto from "node:crypto";

import { applyApiSecurityHeaders } from "@/lib/headers";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireAjax, requireOrigin, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const PromoteSchema = z.object({
  productId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});

// 16-byte hex = 32 char, VARCHAR(64) sınırı içinde rahat.
function newToken() {
  return crypto.randomBytes(16).toString("hex");
}
const TOKEN_TTL_DAYS = 14;

function addParam(u, k, v) {
  if (!u.searchParams.has(k)) u.searchParams.set(k, String(v));
}

export async function POST(req) {
  // Preflight sertleştirme
  try {
    requireOrigin(req);
    requireAjax(req);
  } catch {
    return json({ error: "bad_request" }, { status: 400 });
  }

  let requestId = "unknown";
  try {
    requestId = requireRequestId(req);
  } catch {
    return json({ error: "bad_request" }, { status: 400 });
  }

  // Basit CSRF header’ı (UI zaten gönderiyor)
  if (!req.headers.get("x-csrf-token")) {
    return json({ error: "missing_csrf", request_id: requestId }, { status: 400 });
  }

  // Auth + RBAC
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return json({ error: "unauthorized", request_id: requestId }, { status: 401 });
  if (user.status !== "active") return json({ error: "forbidden_status", request_id: requestId }, { status: 403 });
  if (user.role !== "affiliate" && user.role !== "admin")
    return json({ error: "forbidden_role", request_id: requestId }, { status: 403 });

  // Rate limit
  const rlKey = makeRateLimitKey(req, { scope: "products_promote", userId: user.id });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
  if (!ok) {
    return json(
      { error: "rate_limited", request_id: requestId, retry_after: Math.ceil((resetMs || 0) / 1000) },
      { status: 429 }
    );
  }

  // Body
  let body = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json", request_id: requestId }, { status: 400 });
  }
  const parsed = PromoteSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_params", request_id: requestId }, { status: 400 });
  }
  const productId = Number(parsed.data.productId);

  try {
    // Ürün aktif ve admin onaylı mı?
    const product = await prisma.merchantProduct.findFirst({
      where: { productId, isActive: true, activatedByAdmin: true },
      select: { productId: true, merchantId: true, merchantUrl: true },
    });
    if (!product) {
      audit({ evt: "products.promote.not_found", who: user.id, requestId, productId });
      return json({ error: "product_not_found", request_id: requestId }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // Kullanıcı bu üründe daha önce link oluşturmuş mu?
      const existing = await tx.affiliateLink.findFirst({
        where: { userId: user.id, productId },
        select: { linkId: true, token: true, isVisible: true, expiresAt: true },
      });

      if (existing) {
        if (!existing.isVisible || !existing.expiresAt || existing.expiresAt < new Date()) {
          await tx.affiliateLink.update({
            where: { linkId: existing.linkId },
            data: { isVisible: true, expiresAt },
          });
        }
        return {
          token: existing.token,
          linkId: existing.linkId,
          created: false,
          expiresAt: existing.expiresAt || expiresAt,
        };
      }

      // Aynı kullanıcı + aynı merchant’ta eski token varsa reuse
      const reuse = await tx.affiliateLink.findFirst({
        where: { userId: user.id, product: { merchantId: product.merchantId } },
        select: { token: true },
        orderBy: { createdAt: "asc" },
      });

      let token = reuse?.token;
      if (!token) {
        token = newToken();
        // token global-unique değil ama çakışmayı yine de soft kontrol et
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const dup = await tx.affiliateLink.findFirst({ where: { token } });
          if (!dup) break;
          token = newToken();
        }
      }

      const created = await tx.affiliateLink.create({
        data: { userId: user.id, productId, token, isVisible: true, expiresAt },
        select: { linkId: true, token: true },
      });

      return { token: created.token, linkId: created.linkId, created: !reuse, expiresAt };
    });

    // Paylaşılacak link → merchantUrl + token + lid
    let shareUrl = product.merchantUrl;
    try {
      const u = new URL(product.merchantUrl);
      addParam(u, "token", result.token);
      addParam(u, "lid", result.linkId);
      shareUrl = u.toString();
    } catch {
      // merchantUrl bozuksa yine de token/linkId dönüyoruz
    }

    audit({
      evt: "products.promote.ok",
      who: user.id,
      what: { productId, created: result.created },
      requestId,
      result: "success",
    });

    return json(
      {
        ok: true,
        token: result.token,
        linkId: result.linkId,
        created: result.created,
        expiresAt: result.expiresAt?.toISOString?.() || null,
        shareUrl, // ← PAYLAŞIM LİNKİ (Cabo/ref DEĞİL)
        request_id: requestId,
      },
      { status: 200 }
    );
  } catch (e) {
    audit({ evt: "products.promote.db_error", who: user.id, requestId, code: e?.code || "DB_ERR" });
    return json({ error: "server_error", request_id: requestId }, { status: 500 });
  }
}
