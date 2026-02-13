export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabo — TestShop Verify API (Catch-all like Shopify)
 *
 * Routes:
 * - GET  /api/testshop_verify?ping=1         -> { ok:true, ping:"pong" }
 * - POST /api/testshop_verify                -> verify (fallback)
 * - POST /api/testshop_verify/verify         -> verify (recommended)
 *
 * Contract for TestShop middleware:
 * - Valid => 200 { ok:true, linkId, productId, slug }
 * - Invalid => 4xx { ok:false, error:"..." }
 *
 * Security:
 * - Origin allowlist via TESTSHOP_ORIGIN
 * - Best-effort click write controlled by TESTSHOP_VERIFY_WRITES_CLICK=1/0
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

const ALLOWED_ORIGIN = (process.env.TESTSHOP_ORIGIN || "").trim(); // https://testshopwebsite-production.up.railway.app
const WRITES_CLICK = String(process.env.TESTSHOP_VERIFY_WRITES_CLICK || "1") === "1";
const CLICK_DEDUP_WINDOW_MS = 5 * 60 * 1000;

function j(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");

  if (ALLOWED_ORIGIN) {
    res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "content-type,x-testshop-origin,x-testshop-ua,x-testshop-referer");
  }

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

async function findLinkByTokenAndLid({ token, lid }) {
  const now = new Date();
  return prisma.affiliateLink.findFirst({
    where: {
      token,
      linkId: Number(lid),
      isVisible: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      product: { isActive: true },
    },
    select: {
      linkId: true,
      productId: true,
      product: { select: { slug: true, isActive: true } },
    },
  });
}

async function writeClickBestEffort({ req, linkId }) {
  if (!WRITES_CLICK) return;

  const ip = getClientIp(req);
  const ua = safeHeader(req.headers.get("x-testshop-ua") || req.headers.get("user-agent"), 512) || "unknown";
  const ref = safeHeader(req.headers.get("x-testshop-referer") || req.headers.get("referer"), 2048);

  try {
    const cutoff = new Date(Date.now() - CLICK_DEDUP_WINDOW_MS);
    const exists = await prisma.click.findFirst({
      where: { linkId, ipAddress: ip, userAgent: ua, clickedAt: { gte: cutoff } },
      select: { clickId: true },
    });
    if (exists) return;

    await prisma.click.create({
      data: {
        linkId,
        ipAddress: ip,
        userAgent: ua,
        referrer: ref || null,
        verifiedFrom: "testshop",
        clickedAt: new Date(),
      },
    });

    // totalClicks increment (best-effort)
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
    audit?.({ evt: "testshop_verify.click_write_error", linkId, err: String(e?.message || e).slice(0, 250) });
  }
}

function isAllowedCaller(req) {
  if (!ALLOWED_ORIGIN) return { ok: false, reason: "missing_TESTSHOP_ORIGIN" };

  const origin = (req.headers.get("origin") || "").trim();
  const claimed = (req.headers.get("x-testshop-origin") || "").trim();

  // middleware fetch bazen origin koymayabiliyor, claimed ile destekliyoruz
  const ok =
    origin === ALLOWED_ORIGIN ||
    claimed === ALLOWED_ORIGIN ||
    (!!claimed && claimed.startsWith(ALLOWED_ORIGIN));

  return ok ? { ok: true } : { ok: false, reason: "forbidden_origin" };
}

async function handleVerify(req) {
  const allow = isAllowedCaller(req);
  if (!allow.ok) {
    const status = allow.reason === "missing_TESTSHOP_ORIGIN" ? 500 : 403;
    return j({ ok: false, error: allow.reason }, { status });
  }

  const body = await req.json().catch(() => null);
  const token = String(body?.token || "").trim();
  const lid = body?.lid != null ? Number(body.lid) : NaN;
  const slug = body?.slug ? String(body.slug).trim() : null;

  if (!token || token.length < 16) return j({ ok: false, error: "bad_token" }, { status: 400 });
  if (!Number.isFinite(lid) || lid <= 0) return j({ ok: false, error: "lid_required" }, { status: 400 });

  const link = await findLinkByTokenAndLid({ token, lid });
  if (!link || !link.product?.isActive) return j({ ok: false, error: "not_found_or_expired" }, { status: 404 });

  if (slug && link.product?.slug && slug !== link.product.slug) {
    return j({ ok: false, error: "slug_mismatch" }, { status: 403 });
  }

  await writeClickBestEffort({ req, linkId: link.linkId });

  return j(
    { ok: true, linkId: link.linkId, productId: link.productId, slug: link.product?.slug || null },
    { status: 200 }
  );
}

export async function OPTIONS() {
  return j({ ok: true }, { status: 204 });
}

export async function GET(req) {
  const u = new URL(req.url);
  if (u.searchParams.get("ping") === "1") return j({ ok: true, ping: "pong" }, { status: 200 });
  return j({ ok: true, route: "testshop_verify_root" }, { status: 200 });
}

export async function POST(req) {
  try {
    const u = new URL(req.url);

    // /api/testshop_verify/verify => verify
    if (u.pathname.endsWith("/verify")) return await handleVerify(req);

    // /api/testshop_verify => verify (fallback)
    return await handleVerify(req);
  } catch (e) {
    audit?.({ evt: "testshop_verify.crash", err: String(e?.message || e).slice(0, 300) });
    return j({ ok: false, error: "server_error" }, { status: 500 });
  }
}
