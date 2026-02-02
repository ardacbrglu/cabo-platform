// app/api/dashboard/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Security Docblock (prod)
 * - Auth: NextAuth; require role=affiliate & status=active
 * - Headers: no-store; Vary: Cookie; applyApiSecurityHeaders()
 * - Ratelimit: 60/dk (IP) + 60/dk (userId)
 * - Require: X-Request-Id
 * - DB: Prisma only
 *
 * Perf improvements:
 * - Parallelize independent aggregates with Promise.all
 * - Keep response shape identical to existing UI contract
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}
function json(data, init = {}) {
  return withHeaders(NextResponse.json(data, init));
}
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

async function readNumberConfig(keys, fallback) {
  for (const keyName of keys) {
    const row = await prisma.platformConfig.findUnique({ where: { keyName } });
    const raw = row?.value ?? "";
    const val = Number(raw);
    if (Number.isFinite(val) && val > 0) return val;
    const asFloat = parseFloat(raw);
    if (Number.isFinite(asFloat) && asFloat > 0) return asFloat;
  }
  return fallback;
}

export async function GET(req) {
  const requestId = requireRequestId(req);

  try {
    // RL: IP
    {
      const ipKey = makeRateLimitKey(req, { scope: "dashboard:ip" });
      const { ok, resetMs } = await checkRateLimit({ key: ipKey, limit: 60, windowMs: 60_000 });
      if (!ok) {
        audit({ evt: "dashboard.ratelimit.ip", requestId });
        return json(
          { error: "too_many_requests", request_id: requestId, retry_after: Math.ceil(resetMs / 1000) },
          { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
        );
      }
    }

    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase?.();
    if (!email) return json({ error: "unauthorized", request_id: requestId }, { status: 401 });

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        status: true,
        name: true,
        email: true,
        iban: true,
        bankName: true,
        realUserFullname: true,
      },
    });
    if (!dbUser) return json({ error: "unauthorized", request_id: requestId }, { status: 401 });

    // RL: user
    {
      const userKey = makeRateLimitKey(req, { scope: "dashboard:user", userId: dbUser.id });
      const { ok, resetMs } = await checkRateLimit({ key: userKey, limit: 60, windowMs: 60_000 });
      if (!ok) {
        audit({ evt: "dashboard.ratelimit.user", userId: dbUser.id, requestId });
        return json(
          { error: "too_many_requests", request_id: requestId, retry_after: Math.ceil(resetMs / 1000) },
          { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
        );
      }
    }

    // RBAC
    if (dbUser.role !== "affiliate") return json({ error: "forbidden", request_id: requestId }, { status: 403 });
    if (dbUser.status !== "active") return json({ error: "inactive", request_id: requestId }, { status: 403 });

    const userId = dbUser.id;

    // Config
    const minPayout = await readNumberConfig(["min_payout"], 100);

    let platformCommissionRaw = await readNumberConfig(
      ["platform_commission_rate", "platform_commission_percent", "platform_commission", "platformFeePercent"],
      0.1
    );
    const platformCommission =
      platformCommissionRaw <= 1 ? Math.round(platformCommissionRaw * 100) : Math.round(platformCommissionRaw);

    // Bank fields
    const iban = dbUser.iban || "";
    const bankName = dbUser.bankName || "";
    const realName = dbUser.realUserFullname || "";
    const ibanMissing = !/^TR\d{24}$/.test(iban);
    const bankMissing = !bankName?.trim();
    const realNameMissing = !realName?.trim() || realName.trim().split(/\s+/).length < 2;

    // Links
    const links = await prisma.affiliateLink.findMany({
      where: { userId },
      select: { productId: true, linkId: true },
    });

    const productIds = links.map((l) => l.productId);
    const linkIds = links.map((l) => l.linkId);

    if (productIds.length === 0) {
      return json({
        totalClicks: 0,
        totalSales: 0,
        totalEarnings: 0,
        netPaidTotal: 0,
        confirmedTotal: 0,
        confirmedAvailable: 0,
        minPayout,
        platformCommission,
        username: dbUser.name || "",
        email: dbUser.email || "",
        userId,
        iban,
        bankName,
        ibanMissing,
        bankMissing,
        realNameMissing,
        activeRequestCount: 0,
        payoutEligible: false,
        payoutDisabledReason: "min",
        recentActions: [],
        leaderboard: [],
        lastConversion: null,
        lastClick: null,
      });
    }

    // parallel aggregates
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalClicks,
      salesAggQty,
      earnAgg,
      activeReqCount,
      activeSumAgg,
      paidAgg,
      recentConversions,
      lastConversion,
      lastClick,
    ] = await Promise.all([
      prisma.click.count({ where: { linkId: { in: linkIds } } }),

      prisma.affiliateUserSale.aggregate({
        _sum: { quantity: true },
        where: { productId: { in: productIds }, userId },
      }),

      prisma.affiliateUserSale.aggregate({
        _sum: { commissionAffiliate: true },
        where: { productId: { in: productIds }, userId, status: "confirmed" },
      }),

      prisma.payoutRequest.count({
        where: { userId, status: { in: ["pending", "approved"] } },
      }),

      prisma.payoutRequest.aggregate({
        _sum: { amountTotal: true },
        where: { userId, status: { in: ["pending", "approved"] } },
      }),

      prisma.payoutRequest.aggregate({
        _sum: { netPayable: true },
        where: { userId, status: "paid" },
      }),

      prisma.affiliateUserSale.findMany({
        where: { productId: { in: productIds }, status: "confirmed", userId },
        orderBy: { convertedAt: "desc" },
        take: 5,
        include: { merchantProduct: { select: { name: true } } },
      }),

      prisma.affiliateUserSale.findFirst({
        where: { userId, status: "confirmed", productId: { in: productIds }, convertedAt: { gte: since } },
        orderBy: { convertedAt: "desc" },
        include: { merchantProduct: { select: { name: true } } },
      }),

      prisma.click.findFirst({
        where: { linkId: { in: linkIds }, clickedAt: { gte: since } },
        orderBy: { clickedAt: "desc" },
        include: { affiliateLink: { include: { product: true } } },
      }),
    ]);

    const totalSales = n(salesAggQty?._sum?.quantity);
    const confirmedTotal = n(earnAgg?._sum?.commissionAffiliate);

    const reservedByActive = n(activeSumAgg?._sum?.amountTotal);
    const confirmedAvailable = Math.max(confirmedTotal - reservedByActive, 0);

    const netPaidTotal = n(paidAgg?._sum?.netPayable);

    // Leaderboard (top 3) — keep existing logic but slightly safer scale:
    // group-by top 10, then filter active affiliates, then take 3
    const lbCandidates = await prisma.affiliateUserSale.groupBy({
      by: ["userId"],
      where: { status: "confirmed" },
      _sum: { commissionAffiliate: true },
      orderBy: { _sum: { commissionAffiliate: "desc" } },
      take: 10,
    });

    const candidateIds = lbCandidates.map((x) => x.userId);
    const activeAffiliates = await prisma.user.findMany({
      where: { id: { in: candidateIds }, role: "affiliate", status: "active" },
      select: { id: true, name: true },
    });

    const activeSet = new Set(activeAffiliates.map((u) => u.id));
    const nameById = new Map(activeAffiliates.map((u) => [u.id, u.name || "User"]));

    const leaderboard = lbCandidates
      .filter((row) => activeSet.has(row.userId))
      .slice(0, 3)
      .map((row) => ({
        name: nameById.get(row.userId) || "User",
        value: `₺${n(row?._sum?.commissionAffiliate).toFixed(2)}`,
      }));

    const liveConv = lastConversion
      ? {
          type: "conversion",
          time: lastConversion.convertedAt,
          productName: lastConversion.merchantProduct?.name || "Product",
          commission: n(lastConversion.commissionAffiliate),
          quantity: lastConversion.quantity || 1,
        }
      : null;

    const liveClick = lastClick
      ? {
          type: "click",
          time: lastClick.clickedAt,
          productName: lastClick.affiliateLink?.product?.name || "Product",
          extra: (() => {
            const ua = (lastClick.userAgent || "").toLowerCase();
            if (ua.includes("android")) return "Android";
            if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iOS";
            if (ua.includes("windows")) return "Windows";
            if (ua.includes("mac")) return "Mac";
            return "Other";
          })(),
        }
      : null;

    const payoutEligible =
      confirmedAvailable >= minPayout && !ibanMissing && !bankMissing && !realNameMissing && activeReqCount < 2;

    let payoutDisabledReason = null;
    if (ibanMissing || bankMissing || realNameMissing) payoutDisabledReason = "bank";
    else if (activeReqCount >= 2) payoutDisabledReason = "activeLimit";
    else if (confirmedAvailable < minPayout) payoutDisabledReason = "min";

    audit({ evt: "dashboard.ok", userId, requestId });

    return json({
      totalClicks,
      totalSales,
      totalEarnings: confirmedTotal,
      netPaidTotal,
      confirmedTotal,
      confirmedAvailable,
      minPayout,
      platformCommission,
      username: dbUser.name || "",
      email: dbUser.email || "",
      userId,
      iban,
      bankName,
      ibanMissing,
      bankMissing,
      realNameMissing,
      activeRequestCount: activeReqCount,
      payoutEligible,
      payoutDisabledReason,
      recentActions: (recentConversions || []).map((c) => ({
        amount: `+${n(c.commissionAffiliate).toFixed(2)}₺`,
        product: c.merchantProduct?.name || "Product",
        date: c.convertedAt.toISOString().slice(0, 10),
      })),
      leaderboard,
      lastConversion: liveConv,
      lastClick: liveClick,
    });
  } catch (err) {
    audit({ evt: "dashboard.error", err: String(err?.message || err), requestId });
    return json({ error: "dashboard_fetch_error", request_id: requestId }, { status: 500 });
  }
}
