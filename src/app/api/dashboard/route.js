// app/api/dashboard/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma için Edge değil

/**
 * SECURITY NOTES
 * - Auth: NextAuth session (getServerSession(authOptions)); custom JWT yok.
 * - RBAC: role === "affiliate" ve status === "active" zorunlu.
 * - Rate limit: IP (geniş pencere) + userId (dar pencere). 429'ta Retry-After döner.
 * - Cevap: Cache-Control: no-store; Vary: Cookie. PII sızdırılmaz; alanlar minimal.
 * - GET endpoint olduğu için CSRF gerekmez. Prisma ile güvenli sorgular.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

function getDeviceType(userAgent = "") {
  const ua = (userAgent || "").toLowerCase();
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iPhone";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac")) return "Mac";
  return "Other";
}

export async function GET(req) {
  try {
    // 0) IP rate-limit (geniş pencere, kimlik öncesi)
    {
      const ipKey = makeRateLimitKey(req, { scope: "dashboard:ip" });
      const { ok, resetMs } = await checkRateLimit({ key: ipKey, limit: 40, windowMs: 60_000 });
      if (!ok) {
        return json(
          { error: "too_many_requests" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
        );
      }
    }

    // 1) Session
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase?.();
    if (!email) return json({ error: "unauthorized" }, { status: 401 });

    // 2) Kullanıcı (minimal seçim)
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
    if (!dbUser) return json({ error: "unauthorized" }, { status: 401 });

    // 2.5) Kullanıcı rate-limit (dar pencere)
    {
      const userKey = makeRateLimitKey(req, { scope: "dashboard:user", userId: dbUser.id });
      const { ok, resetMs } = await checkRateLimit({ key: userKey, limit: 30, windowMs: 60_000 });
      if (!ok) {
        return json(
          { error: "too_many_requests" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
        );
      }
    }

    // 3) RBAC
    if (dbUser.role !== "affiliate") return json({ error: "forbidden" }, { status: 403 });
    if (dbUser.status !== "active") return json({ error: "inactive" }, { status: 403 });

    const userId = dbUser.id;

    // 4) Platform ayarları (opsiyonel, yoksa varsayılan)
    let minPayout = 100;
    try {
      const cfg = await prisma.platformConfig.findUnique({ where: { keyName: "min_payout" } });
      if (cfg?.value) minPayout = Number(cfg.value);
    } catch {}

    let platformCommission = 5;
    try {
      const pcfg = await prisma.platformConfig.findUnique({ where: { keyName: "platform_commission" } });
      if (pcfg?.value) platformCommission = Number(pcfg.value);
    } catch {}

    // 5) Banka alan kontrolleri (TR IBAN örneği)
    const iban = dbUser.iban || "";
    const bankName = dbUser.bankName || "";
    const realName = dbUser.realUserFullname || "";
    const ibanMissing = !iban || iban.length !== 26 || !iban.startsWith("TR");
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(" ").length < 2;

    // 6) Kullanıcı linkleri
    const userLinks = await prisma.affiliateLink.findMany({
      where: { userId },
      select: { productId: true, linkId: true },
    });
    const productIds = userLinks.map((l) => l.productId);
    const linkIds = userLinks.map((l) => l.linkId);

    if (!productIds.length) {
      // Link yoksa boş ama faydalı bir özet döndür
      return json({
        totalClicks: 0,
        totalSales: 0,
        totalEarnings: 0,
        balance: 0,
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
        recentActions: [],
        leaderboard: [],
        lastConversion: null,
        lastClick: null,
      });
    }

    // 7) Sayaçlar
    const totalClicks = await prisma.click.count({ where: { linkId: { in: linkIds } } });

    const totalSalesAgg = await prisma.affiliateUserSale.aggregate({
      _sum: { quantity: true },
      where: { productId: { in: productIds }, userId },
    });
    const totalSales = Number(totalSalesAgg._sum.quantity) || 0;

    const totalEarnAgg = await prisma.affiliateUserSale.aggregate({
      _sum: { commissionAffiliate: true },
      where: { productId: { in: productIds }, userId, status: "confirmed" },
    });
    const totalEarnings = Number(totalEarnAgg._sum.commissionAffiliate) || 0;
    const balance = totalEarnings;

    // 8) Son 5 confirmed satış (liste)
    const recentConversions = await prisma.affiliateUserSale.findMany({
      where: { productId: { in: productIds }, status: "confirmed" },
      orderBy: { convertedAt: "desc" },
      take: 5,
      include: { merchantProduct: { select: { name: true } } },
    });

    // 9) Leaderboard (aktif affiliates → top-3)
    const activeAffiliates = await prisma.user.findMany({
      where: { role: "affiliate", status: "active" },
      select: { id: true, name: true },
    });
    const affiliateIdSet = new Set(activeAffiliates.map((u) => u.id));
    const agg = await prisma.affiliateUserSale.groupBy({
      by: ["userId"],
      where: { status: "confirmed", userId: { in: [...affiliateIdSet] } },
      _sum: { commissionAffiliate: true },
      orderBy: { _sum: { commissionAffiliate: "desc" } },
      take: 3,
    });
    const nameById = new Map(activeAffiliates.map((u) => [u.id, u.name || "User"]));
    const leaderboard = agg.map((row) => ({
      name: nameById.get(row.userId) || "User",
      value: Number(row._sum.commissionAffiliate || 0),
    }));

    // 10) Son 24 saat aktivitesi
    const lastConversion = await prisma.affiliateUserSale.findFirst({
      where: {
        userId,
        status: "confirmed",
        productId: { in: productIds },
        convertedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { convertedAt: "desc" },
      include: { merchantProduct: { select: { name: true } } },
    });

    let lastConversionData = null;
    if (lastConversion) {
      lastConversionData = {
        type: "conversion",
        time: lastConversion.convertedAt,
        productName: lastConversion.merchantProduct?.name || "Unknown Product",
        commission: Number(lastConversion.commissionAffiliate || 0),
        quantity: lastConversion.quantity || 1,
      };
    }

    const lastClick = await prisma.click.findFirst({
      where: {
        linkId: { in: linkIds },
        clickedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { clickedAt: "desc" },
      include: { affiliateLink: { include: { product: true } } },
    });

    let lastClickData = null;
    if (lastClick) {
      lastClickData = {
        type: "click",
        time: lastClick.clickedAt,
        productName: lastClick.affiliateLink?.product?.name || "Unknown Product",
        extra: getDeviceType(lastClick.userAgent),
      };
    }

    // 11) Yanıt (TRY sembolü; aritmetik number döndürülür)
    return json({
      totalClicks,
      totalSales,
      totalEarnings,
      balance,
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
      recentActions: (recentConversions || []).map((c) => ({
        amount: `+${Number(c.commissionAffiliate).toFixed(2)}₺`,
        desc: `Sale: ${c.merchantProduct?.name || "Product"} (${c.quantity || 1} adet)`,
        date: c.convertedAt.toISOString().slice(0, 10),
      })),
      leaderboard: leaderboard.map((l) => ({ name: l.name, value: `₺${l.value.toFixed(2)}` })),
      lastConversion: lastConversionData,
      lastClick: lastClickData,
    });
  } catch (err) {
    console.error("Dashboard API error:", err);
    return json({ error: "dashboard_fetch_error" }, { status: 500 });
  }
}
