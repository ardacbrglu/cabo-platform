export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bir ürünü “My Links”e ekle (token oluştur / görünür yap)
 * Notlar:
 * - token artık unique değil → findFirst kullanıyoruz
 * - aynı kullanıcı + aynı merchant için tek token reuse
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

// VARCHAR(64) sınırı içinde rahat: 16 byte hex = 32 char
function newToken() {
  return crypto.randomBytes(16).toString("hex");
}

const TOKEN_TTL_DAYS = 14;

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

  // CSRF header var mı?
  if (!req.headers.get("x-csrf-token")) {
    return json({ error: "missing_csrf", request_id: requestId }, { status: 400 });
  }

  // Auth (session + RBAC)
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return json({ error: "unauthorized", request_id: requestId }, { status: 401 });
  if (user.status !== "active") return json({ error: "forbidden_status", request_id: requestId }, { status: 403 });
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

  try {
    // Ürün aktif + admin onaylı mı? reuse için merchantId da al
    const product = await prisma.merchantProduct.findFirst({
      where: { productId, isActive: true, activatedByAdmin: true },
      select: { productId: true, merchantId: true },
    });
    if (!product) {
      audit({ evt: "products.promote.not_found", who: user.id, requestId, productId });
      return json({ error: "product_not_found", request_id: requestId }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // Bu kullanıcı bu ürünü daha önce eklediyse görünür/yenile
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
        return { token: existing.token, created: false, expiresAt: existing.expiresAt || expiresAt };
      }

      // 1) Aynı kullanıcı + aynı merchant için daha önce üretilmiş token varsa reuse et
      const reuse = await tx.affiliateLink.findFirst({
        where: {
          userId: user.id,
          product: { merchantId: product.merchantId },
        },
        select: { token: true },
        orderBy: { createdAt: "asc" },
      });

      let token = reuse?.token;

      // 2) Hiç yoksa yeni token üret; global çakışmayı soft kontrol et
      if (!token) {
        token = newToken();
        // token unique değil → findFirst ile soft check
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const dup = await tx.affiliateLink.findFirst({ where: { token } });
          if (!dup) break;
          token = newToken();
        }
      }

      await tx.affiliateLink.create({
        data: {
          userId: user.id,
          productId,
          token,
          isVisible: true,
          expiresAt,
        },
      });

      return { token, created: !reuse, expiresAt };
    });

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
        created: result.created,
        expiresAt: result.expiresAt?.toISOString?.() || null,
        request_id: requestId,
      },
      { status: 200 }
    );
  } catch (e) {
    audit({ evt: "products.promote.db_error", who: user.id, requestId, code: e?.code || "DB_ERR" });
    return json({ error: "server_error", request_id: requestId }, { status: 500 });
  }
}
