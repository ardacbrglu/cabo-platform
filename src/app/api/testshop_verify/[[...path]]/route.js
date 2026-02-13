export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabo — TestShop Verify API (S2S)
 *
 * Amaç:
 * - TestShop, siteye token/lid ile gelince Cabo'ya sorar: "Bu token valid mi?"
 * - Cabo 200 döner (ok:true) ama valid true/false ayrımı JSON içinde olur
 * - İstersen bu endpoint içinde click de yazdırabiliriz (enabled via env)
 *
 * Query:
 * - token (required)
 * - lid (optional ama önerilir)
 *
 * Response (always 200 unless server crash):
 * - { ok:true, valid:true, linkId, productId, slug }
 * - { ok:true, valid:false, error:"not_found" | "lid_required" | "expired" | ... }
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "node:crypto";

// Opsiyonel: Cabo projesinde varsa kullan (yoksa kaldır)
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

const CLICK_DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 dk

function j(data) {
  const res = NextResponse.json(data, { status: 200 });
  res.headers.set("Cache-Control", "no-store");
  // CORS (TestShop için)
  const allowOrigin = (process.env.TESTSHOP_ORIGIN || "").trim(); // ör: https://testshopwebsite-production.up.railway.app
  if (allowOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowOrigin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "content-type");
  return applyApiSecurityHeaders ? applyApiSecurityHeaders(res) : res;
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

/**
 * token + (optional) lid ile affiliate link bulur.
 * - token birden fazla linke bağlıysa lid yoksa ambiguous => lid_required
 */
async function findLinkByTokenAndMaybeLid({ token, lid }) {
  const now = new Date();

  const whereCommon = {
    token,
    isVisible: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    product: { isActive: true },
  };

  if (lid != null) {
    const link = await prisma.affiliateLink.findFirst({
      where: { ...whereCommon, linkId: Number(lid) },
      select: {
        linkId: true,
        productId: true,
        product: { select: { slug: true, isActive: true } },
      },
    });
    return { link: link || null, ambiguous: false };
  }

  // lid yoksa -> token aynı mı, 1 mi 2+ mı kontrol
  const sample = await prisma.affiliateLink.findMany({
    where: whereCommon,
    select: {
      linkId: true,
      productId: true,
      product: { select: { slug: true, isActive: true } },
    },
    orderBy: { linkId: "desc" },
    take: 2,
  });

  if (sample.length === 0) return { link: null, ambiguous: false };
  if (sample.length === 1) return { link: sample[0], ambiguous: false };
  return { link: null, ambiguous: true };
}

async function maybeWriteClick({ req, linkId, verifiedFrom }) {
  const enabled = String(process.env.TESTSHOP_VERIFY_WRITES_CLICK || "1") === "1";
  if (!enabled) return;

  const ip = getClientIp(req);
  const ua = safeHeader(req.headers.get("user-agent"), 512) || "unknown";
  const ref = safeHeader(req.headers.get("referer") || req.headers.get("referrer"), 2048);

  try {
    const cutoff = new Date(Date.now() - CLICK_DEDUP_WINDOW_MS);

    const exists = await prisma.click.findFirst({
      where: {
        linkId,
        ipAddress: ip,
        userAgent: ua,
        clickedAt: { gte: cutoff },
      },
      select: { clickId: true },
    });

    if (exists) return;

    await prisma.click.create({
      data: {
        linkId,
        ipAddress: ip,
        userAgent: ua,
        referrer: ref || null,
        verifiedFrom: verifiedFrom || "testshop",
        clickedAt: new Date(),
      },
    });

    // (opsiyonel) MerchantProduct.totalClicks increment
    try {
      const link = await prisma.affiliateLink.findUnique({
        where: { linkId },
        select: { productId: true },
      });
      if (link?.productId) {
        await prisma.merchantProduct.update({
          where: { productId: link.productId },
          data: { totalClicks: { increment: 1 } },
        });
      }
    } catch {}
  } catch (e) {
    audit?.({
      evt: "testshop_verify.click_write_error",
      linkId,
      err: String(e?.message || e).slice(0, 300),
    });
  }
}

export async function OPTIONS() {
  // Preflight
  return j({ ok: true });
}

export async function GET(req) {
  try {
    const u = new URL(req.url);
    const token = (u.searchParams.get("token") || "").trim();
    const lidRaw = u.searchParams.get("lid");
    const lid = lidRaw != null && String(lidRaw).trim() !== "" ? Number(lidRaw) : null;

    if (!token || token.length < 16) return j({ ok: true, valid: false, error: "missing_token" });

    const { link, ambiguous } = await findLinkByTokenAndMaybeLid({ token, lid });

    if (ambiguous) return j({ ok: true, valid: false, error: "lid_required" });
    if (!link || !link.product?.isActive) return j({ ok: true, valid: false, error: "not_found" });

    // ✅ burada click yaz (istersen)
    await maybeWriteClick({
      req,
      linkId: link.linkId,
      verifiedFrom: "testshop",
    });

    return j({
      ok: true,
      valid: true,
      token,
      linkId: link.linkId,
      productId: link.productId,
      slug: link.product?.slug || null,
    });
  } catch (e) {
    audit?.({ evt: "testshop_verify.crash", err: String(e?.message || e).slice(0, 300) });
    // 200 dönelim, TestShop middleware “valid:false” sayacak
    return j({ ok: true, valid: false, error: "server_error" });
  }
}

// İstersen POST da aynı işi yapsın (ileride)
export async function POST(req) {
  // body: { token, lid }
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const lidRaw = body?.lid;
    const lid = lidRaw != null && String(lidRaw).trim() !== "" ? Number(lidRaw) : null;

    if (!token || token.length < 16) return j({ ok: true, valid: false, error: "missing_token" });

    const { link, ambiguous } = await findLinkByTokenAndMaybeLid({ token, lid });

    if (ambiguous) return j({ ok: true, valid: false, error: "lid_required" });
    if (!link || !link.product?.isActive) return j({ ok: true, valid: false, error: "not_found" });

    await maybeWriteClick({
      req,
      linkId: link.linkId,
      verifiedFrom: "testshop",
    });

    return j({
      ok: true,
      valid: true,
      token,
      linkId: link.linkId,
      productId: link.productId,
      slug: link.product?.slug || null,
    });
  } catch (e) {
    audit?.({ evt: "testshop_verify.post_crash", err: String(e?.message || e).slice(0, 300) });
    return j({ ok: true, valid: false, error: "server_error" });
  }
}
