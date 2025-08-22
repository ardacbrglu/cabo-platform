export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/products/promote/route.js
 * Purpose: Bir ürünü “My Links”e ekle (unique token oluştur / görünür yap)
 * Security Docblock:
 * - Auth: NextAuth → require status:active & role:affiliate
 * - CSRF: NextAuth’ın /api/auth/csrf + header “x-csrf-token” (frontend wrapper)
 * - Headers: Origin/Referer eşleşmesi; X-Requested-With; X-Request-Id
 * - Ratelimit: POST 10/dk (IP+userId)
 * - Validation: Zod (productId)
 * - TX: Tüm mutasyonlar transaction; audit({who, what, ip, ua, requestId, result})
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

function newToken() {
  // 32-byte URL-safe token
  return crypto.randomBytes(24).toString("base64url");
}

export async function POST(req) {
  // Harden preflight
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

  // Auth (session + RBAC)
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return json({ error: "unauthorized", request_id: requestId }, { status: 401 });
  if (user.status !== "active")
    return json({ error: "forbidden_status", request_id: requestId }, { status: 403 });
  if (user.role !== "affiliate" && user.role !== "admin")
    return json({ error: "forbidden_role", request_id: requestId }, { status: 403 });

  // Rate limit: mutation 10/dk
  const rlKey = makeRateLimitKey(req, { scope: "products_promote", userId: user.id });
  const { ok, resetMs } = await checkRateLimit({
    key: rlKey,
    limit: 10,
    windowMs: 60_000,
  });
  if (!ok) {
    return json(
      { error: "rate_limited", request_id: requestId, retry_after: Math.ceil((resetMs || 0) / 1000) },
      { status: 429 }
    );
  }

  // Parse + validate
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

  // İş mantığı:
  // - Ürün aktif ve admin onaylı mı kontrol et
  // - (user, product) için AffiliateLink varsa: görünür yap
  // - yoksa: unique token üret ve oluştur
  try {
    const product = await prisma.merchantProduct.findFirst({
      where: { product_id: productId, is_active: true, activated_by_admin: true },
      select: { product_id: true },
    });
    if (!product) {
      audit({ evt: "products.promote.not_found", who: user.id, requestId, productId });
      return json({ error: "product_not_found", request_id: requestId }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.affiliateLink.findFirst({
        where: { user_id: user.id, product_id: productId },
        select: { id: true, token: true, is_visible: true },
      });

      if (existing) {
        if (!existing.is_visible) {
          await tx.affiliateLink.update({
            where: { id: existing.id },
            data: { is_visible: true },
          });
        }
        return { token: existing.token, created: false };
      }

      // yeni unique token
      let token = newToken();
      // collision ihtimali düşük ama yine de kontrol et
      // (loop nadiren döner)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const dup = await tx.affiliateLink.findUnique({ where: { token } });
        if (!dup) break;
        token = newToken();
      }

      await tx.affiliateLink.create({
        data: {
          user_id: user.id,
          product_id: productId,
          token,
          is_visible: true,
        },
      });

      return { token, created: true };
    });

    audit({
      evt: "products.promote.ok",
      who: user.id,
      what: { productId, created: result.created },
      requestId,
      result: "success",
    });
    return json({ ok: true, token: result.token, created: result.created, request_id: requestId }, { status: 200 });
  } catch (e) {
    audit({
      evt: "products.promote.db_error",
      who: user.id,
      requestId,
      code: e?.code || "DB_ERR",
    });
    return json({ error: "server_error", request_id: requestId }, { status: 500 });
  }
}
