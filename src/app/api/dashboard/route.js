// app/api/dashboard/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { getServerSession } from "next-auth";

function getDeviceType(userAgent = "") {
  userAgent = (userAgent || "").toLowerCase();
  if (userAgent.includes("android")) return "Android";
  if (userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("ios")) return "iPhone";
  if (userAgent.includes("windows")) return "Windows";
  if (userAgent.includes("mac")) return "Mac";
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
    // ✅ NextAuth session kontrolü
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return json({ error: "unauthorized" }, { status: 401 });
    }

    // ✅ Rol kontrolü: Sadece affiliate kullanıcılar erişebilir
    if (session.user.role !== "affiliate") {
      return json({ error: "forbidden" }, { status: 403 });
    }

    const userId = session.user.id;

    // Platform config'ten min payout
    let minPayout = 100;
    try {
      const config = await prisma.platformConfig.findUnique({
        where: { keyName: "min_payout" },
      });
      if (config?.value) minPayout = Number(config.value);
    } catch {
      minPayout = 100;
    }

    // Kullanıcı banka & iban & ad bilgisi
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, iban: true, bankName: true, realUserFullname: true },
    });
    const iban = user?.iban || "";
    const bankName = user?.bankName || "";
    const realName = user?.realUserFullname || "";
    const ibanMissing = !iban || iban.length !== 26 || !iban.startsWith("TR");
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(" ").length < 2;

    // Kullanıcının sahip olduğu productId'ler
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
        username: user?.name || "",
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

    // Toplam tıklama
    const totalClicks = await prisma.click.count({
      where: { linkId: { in: linkIds } },
    });

    // Toplam satış adedi
    const totalSalesData = await prisma.affiliateUserSale.aggregate({
      _sum: { quantity: true },
      where: { productId: { in: productIds }, userId },
    });
    const totalSales = Number(totalSalesData._sum.quantity) || 0;

    // Toplam confirmed kazanç
    const totalEarningsData = await prisma.affiliateUserSale.aggregate({
      _sum: { commissionAffiliate: true },
      where: { productId: { in: productIds }, userId, status: "confirmed" },
    });
    const totalEarnings = Number(totalEarningsData._sum.commissionAffiliate) || 0;
    const balance = totalEarnings;

    // Son 5 satış (confirmed)
    const recentConversions = await prisma.affiliateUserSale.findMany({
      where: { productId: { in: productIds }, status: "confirmed" },
      orderBy: { convertedAt: "desc" },
      take: 5,
      include: { merchantProduct: { select: { name: true } } },
    });

    // Leaderboard
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

    // Son satış (24h)
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

    // Son click (24h)
    const lastClick = await prisma.click.findFirst({
      where: { linkId: { in: linkIds }, clickedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
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

    return json({
      totalClicks,
      totalSales,
      totalEarnings,
      balance,
      minPayout,
      username: user?.name || "",
      iban,
      bankName,
      ibanMissing,
      bankMissing,
      realNameMissing,
      recentActions: (recentConversions || []).map((conv) => ({
        amount: `+${Number(conv.commissionAffiliate).toFixed(2)}₺`,
        desc: `Sale: ${conv.merchantProduct?.name || "Product"} (${conv.quantity || 1} adet)`,
        date: conv.convertedAt.toISOString().slice(0, 10),
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
