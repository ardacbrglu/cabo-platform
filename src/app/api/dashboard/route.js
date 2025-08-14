export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";

function getDeviceType(userAgent = "") {
  const ua = (userAgent || "").toLowerCase();
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iPhone";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac")) return "Mac";
  return "Other";
}

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET() {
  try {
    // 1) Session
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase?.();
    if (!email) return json({ error: "unauthorized" }, { status: 401 });

    // 2) Kullanıcıyı DB’den e-posta ile çek (id tip uyumsuzluğu riskini kaldırır)
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

    // 3) Rol/Status kapıları
    if (dbUser.role !== "affiliate") return json({ error: "forbidden" }, { status: 403 });
    if (dbUser.status !== "active") return json({ error: "inactive" }, { status: 403 });

    const userId = dbUser.id;

    // 4) Min payout (platform config)
    let minPayout = 100;
    try {
      const cfg = await prisma.platformConfig.findUnique({ where: { keyName: "min_payout" } });
      if (cfg?.value) minPayout = Number(cfg.value);
    } catch {
      /* default 100 */
    }

    // 5) Banka bilgileri & eksik alanlar
    const iban = dbUser.iban || "";
    const bankName = dbUser.bankName || "";
    const realName = dbUser.realUserFullname || "";
    const ibanMissing = !iban || iban.length !== 26 || !iban.startsWith("TR");
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(" ").length < 2;

    // 6) Kullanıcının linkleri / ürünleri
    const userLinks = await prisma.affiliateLink.findMany({
      where: { userId },
      select: { productId: true, linkId: true },
    });
    const productIds = userLinks.map((l) => l.productId);
    const linkIds = userLinks.map((l) => l.linkId);

    if (!productIds.length) {
      return json({
        totalClicks: 0,
        totalSales: 0,
        totalEarnings: 0,
        balance: 0,
        minPayout,
        username: dbUser.name || "",
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

    // 7) Ana sayılar
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

    // 8) Son 5 confirmed satış
    const recentConversions = await prisma.affiliateUserSale.findMany({
      where: { productId: { in: productIds }, status: "confirmed" },
      orderBy: { convertedAt: "desc" },
      take: 5,
      include: { merchantProduct: { select: { name: true } } },
    });

    // 9) Leaderboard (ilk 3)
    const leaderboardRaw = await prisma.user.findMany({
      where: { role: "affiliate" },
      select: { name: true, affiliateLinks: { select: { productId: true } } },
    });
    const leaderboard = await Promise.all(
      leaderboardRaw.map(async (u) => {
        const pids = u.affiliateLinks.map((l) => l.productId);
        if (!pids.length) return { name: u.name, value: 0 };
        const sum = await prisma.affiliateUserSale.aggregate({
          _sum: { commissionAffiliate: true },
          where: { productId: { in: pids }, status: "confirmed" },
        });
        return { name: u.name, value: Number(sum._sum.commissionAffiliate || 0) };
      })
    );
    leaderboard.sort((a, b) => b.value - a.value);

    // 10) Son 24 saat satış/click
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

    // 11) Yanıt
    return json({
      totalClicks,
      totalSales,
      totalEarnings,
      balance,
      minPayout,
      username: dbUser.name || "",
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
      leaderboard: leaderboard.slice(0, 3).map((l) => ({ name: l.name, value: `₺${l.value.toFixed(2)}` })),
      lastConversion: lastConversionData,
      lastClick: lastClickData,
    });
  } catch (err) {
    console.error("Dashboard API error:", err);
    return json({ error: "dashboard_fetch_error" }, { status: 500 });
  }
}
