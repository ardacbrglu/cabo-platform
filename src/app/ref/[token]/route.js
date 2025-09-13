// app/api/ref/[token]/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Referral redirect endpoint (token artık unique DEĞİL)
 * - Zod ile param doğrulama
 * - Soft rate-limit (IP+UA); limitteyse yazma atlanır ama redirect denenir
 * - 30dk dedup: (linkId, ip, ua)
 * - Tek transaction: click insert + product.totalClicks increment
 * - lid (linkId) varsa: token + linkId ile NET eşleşme; yoksa token ile son (en yeni) link
 * - Yalnızca http/https yönlendirme; token (ve lid) paramlarını idempotent ekler
 * - Tüm yanıtlarda: no-store + sıkı güvenlik başlıkları
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

// --- Configs
const CLICK_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30m
const RL = { limit: 120, windowMs: 60_000 }; // 120/min per IP+UA

// --- Helpers
const paramsSchema = z.object({
  token: z.string().min(16).max(128),
});

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

function getClientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const rip = req.headers.get("x-real-ip");
  if (rip) return rip;
  return "unknown";
}

function safeHeader(h, max = 512) {
  return (h || "").toString().slice(0, max);
}

function safeAppend(u, key, val) {
  if (val == null || val === "") return;
  if (!u.searchParams.has(key)) u.searchParams.set(key, String(val));
}

// Opsiyonel sağlık kontrolü
export async function HEAD() {
  return withHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req, { params }) {
  // 1) Validate route params
  const parsed = paramsSchema.safeParse(params || {});
  if (!parsed.success) {
    return withHeaders(NextResponse.json({ error: "bad_request" }, { status: 400 }));
  }
  const { token } = parsed.data;

  // 2) lid (linkId) query param
  const url = new URL(req.url);
  const lidRaw = url.searchParams.get("lid");
  const lid = Number.isFinite(Number(lidRaw)) ? Number(lidRaw) : null;

  // 3) Soft rate limit (skip writes if exceeded, but still attempt redirect)
  const rlKey = makeRateLimitKey(req, { scope: "ref" });
  const rl = await checkRateLimit({ key: rlKey, limit: RL.limit, windowMs: RL.windowMs });
  const overLimit = !rl.ok;

  try {
    const now = new Date();

    // 4) Link çözümleme:
    // Önce lid + token ile net eşleşmeyi dene; yoksa token ile en yeni aktif linki al
    let link = null;
    if (lid !== null) {
      link = await prisma.affiliateLink.findFirst({
        where: {
          linkId: lid,
          token,
          isVisible: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          product: { isActive: true },
        },
        select: {
          linkId: true,
          productId: true,
          product: { select: { merchantUrl: true, isActive: true } },
        },
      });
    }
    if (!link) {
      link = await prisma.affiliateLink.findFirst({
        where: {
          token,
          isVisible: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          product: { isActive: true },
        },
        select: {
          linkId: true,
          productId: true,
          product: { select: { merchantUrl: true, isActive: true } },
        },
        orderBy: { linkId: "desc" },
      });
    }

    if (!link || !link.product?.isActive) {
      audit?.({ evt: "ref.not_found_or_inactive", token, lid });
      return withHeaders(NextResponse.json({ error: "not_found" }, { status: 404 }));
    }

    // 5) Client meta
    const ip = getClientIp(req);
    const ua = safeHeader(req.headers.get("user-agent"), 512) || "unknown";
    const ref = safeHeader(req.headers.get("referer") || req.headers.get("referrer"), 2048);

    // 6) Dedup & write (skip if overLimit)
    if (!overLimit) {
      const cutoff = new Date(Date.now() - CLICK_DEDUP_WINDOW_MS);
      const existing = await prisma.click.findFirst({
        where: {
          linkId: link.linkId,
          ipAddress: ip,
          userAgent: ua,
          clickedAt: { gte: cutoff },
        },
        select: { clickId: true },
      });

      if (!existing) {
        await prisma.$transaction([
          prisma.click.create({
            data: {
              linkId: link.linkId,
              ipAddress: ip,
              userAgent: ua,
              referrer: ref || null,
              clickedAt: new Date(),
            },
          }),
          prisma.merchantProduct.update({
            where: { productId: link.productId },
            data: { totalClicks: { increment: 1 } },
          }),
        ]);
      }
    } else {
      audit?.({ evt: "ref.ratelimited_skip_write", token, lid, ip });
    }

    // 7) URL doğrula + token/lid ekle (idempotent)
    let redirectUrl;
    try {
      redirectUrl = new URL(link.product.merchantUrl);
    } catch {
      audit?.({ evt: "ref.bad_merchant_url", productId: link.productId });
      return withHeaders(NextResponse.json({ error: "bad_merchant_url" }, { status: 400 }));
    }
    if (!["http:", "https:"].includes(redirectUrl.protocol)) {
      return withHeaders(NextResponse.json({ error: "bad_merchant_url" }, { status: 400 }));
    }

    // Token ve lid paramlarını tekrar etmeyecek şekilde ekle
    safeAppend(redirectUrl, "token", token);
    safeAppend(redirectUrl, "lid", link.linkId);

    // 8) Redirect
    const res = NextResponse.redirect(redirectUrl.toString(), { status: 302 });
    return withHeaders(res);
  } catch (err) {
    console.error("[ref] GET error:", err?.message || err);
    audit?.({ evt: "ref.error", error: (err?.message || String(err)).slice(0, 200) });
    return withHeaders(NextResponse.json({ error: "server_error" }, { status: 500 }));
  }
}
