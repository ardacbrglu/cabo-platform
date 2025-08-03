import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
// import { checkRateLimit } from "@/lib/ratelimit"; // eklemek istersen

// User-agent string'inden cihaz tipini bulan fonksiyon
function getDeviceType(userAgent = "") {
  userAgent = (userAgent || "").toLowerCase();
  if (userAgent.includes("android")) return "Android";
  if (userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("ios")) return "iPhone";
  if (userAgent.includes("windows")) return "Windows";
  if (userAgent.includes("mac")) return "Mac";
  return "Other";
}

export async function GET(req) {
  try {
    // 1. Kullanıcı doğrulama (JWT)
    const token = getTokenFromRequest(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const userId = payload.userId;

    // 2. Platform config'ten min payout
    let minPayout = 100;
    try {
      const config = await prisma.platform_config.findUnique({
        where: { key_name: "min_payout" }
      });
      if (config && config.value) minPayout = Number(config.value);
    } catch { minPayout = 100; }

    // 3. Kullanıcı banka & iban & ad bilgisi
    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { name: true, email: true, iban: true, bankName: true, realUserFullname: true }
    });
    const iban = user?.iban || "";
    const bankName = user?.bankName || "";
    const realName = user?.realUserFullname || "";
    const ibanMissing = !iban || iban.length !== 26 || !iban.startsWith("TR");
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(" ").length < 2;

    // 4. Kullanıcının sahip olduğu productId'ler
    const userLinks = await prisma.affiliateLink.findMany({
      where: { userId: userId },
      select: { productId: true, linkId: true }
    });
    const productIds = userLinks.map(l => l.productId);
    const linkIds = userLinks.map(l => l.linkId);

    // Eğer hiç ürünü yoksa boş veri dön
    if (!productIds.length) {
      return NextResponse.json({
        totalClicks: 0,
        totalSales: 0,
        totalEarnings: 0,
        balance: 0,
        minPayout,
        username: user?.name || payload.name || "",
        iban,
        bankName,
        ibanMissing,
        bankMissing,
        realNameMissing,
        recentActions: [],
        leaderboard: [],
        lastConversion: null,
        lastClick: null
      });
    }

    // 5. Toplam tıklama
    const totalClicks = await prisma.click.count({
      where: { linkId: { in: linkIds } }
    });

    // 6. Toplam satış adedi
    const totalSalesData = await prisma.affiliateUserSale.aggregate({
      _sum: { quantity: true },
      where: { productId: { in: productIds }, userId:userId }
    });
    const totalSales = Number(totalSalesData._sum.quantity) || 0;

    // 7. Toplam confirmed kazanç
    const totalEarningsData = await prisma.affiliateUserSale.aggregate({
      _sum: { commissionAffiliate: true },
      where: { productId: { in: productIds }, userId: userId, status: 'confirmed' }
    });
    const totalEarnings = Number(totalEarningsData._sum.commissionAffiliate) || 0;
    const balance = totalEarnings;

    // 8. Son 5 satış (confirmed)
    const recentConversions = await prisma.affiliateUserSale.findMany({
      where: { productId: { in: productIds }, status: 'confirmed' },
      orderBy: { converted_at: 'desc' },
      take: 5,
      include: { merchantProducts: { select: { name: true } } }
    });

    // 9. Leaderboard: En çok kazanan ilk 3 affiliate
    const allAffiliates = await prisma.user.findMany({
      where: { role: 'affiliate' },
      select: {
        userId: true,
        name: true,
        affiliateLinks: { select: { productId: true } }
      }
    });

    // Her affiliate için toplam confirmed kazanç
    const leaderboardRaw = await Promise.all(allAffiliates.map(async u => {
      const pids = u.affiliateLinks.map(l => l.productId);
      if (!pids.length) return { name: u.name, value: 0 };
      const sum = await prisma.affiliateUserSale.aggregate({
        _sum: { commissionAffiliate: true },
        where: { productId: { in: pids }, status: 'confirmed' }
      });
      return { name: u.name, value: Number(sum._sum.commissionAffiliate || 0) };
    }));

    const leaderboard = (leaderboardRaw || [])
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    // 10. **CANLI** Son satış (son 24 saat)
    const lastConversion = await prisma.affiliateUserSale.findFirst({
      where: {
        userId: userId,
        status: "confirmed",
        productId: { in: productIds },
        converted_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      orderBy: { converted_at: "desc" },
      include: { merchantProducts: { select: { name: true } } }
    });

    let lastConversionData = null;
    if (lastConversion) {
      lastConversionData = {
        type: "conversion",
        time: lastConversion.converted_at,
        productName: lastConversion.merchantProducts?.name || "Unknown Product",
        commission: Number(lastConversion.commissionAffiliate || 0),
        quantity: lastConversion.quantity || 1
      };
    }

    // 11. **CANLI** Son click (son 24 saat)
    const lastClick = await prisma.click.findFirst({
      where: {
        linkId: { in: linkIds },
        clicked_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      orderBy: { clicked_at: "desc" },
      include: {
        affiliate_link: {
          include: { product: true }
        }
      }
    });

    let lastClickData = null;
    if (lastClick) {
      lastClickData = {
        type: "click",
        time: lastClick.clicked_at,
        productName: lastClick.affiliate_link?.product?.name || "Unknown Product",
        extra: getDeviceType(lastClick.user_agent)
      };
    }

    return NextResponse.json({
      totalClicks,
      totalSales,
      totalEarnings,
      balance,
      minPayout,
      username: user?.name || payload.name || "",
      iban,
      bankName,
      ibanMissing,
      bankMissing,
      realNameMissing,
      recentActions: (recentConversions || []).map(conv => ({
        amount: `+${Number(conv.commissionAffiliate).toFixed(2)}₺`,
        desc: `Sale: ${conv.merchantProducts?.name || 'Product'} (${conv.quantity || 1} adet)`,
        date: conv.converted_at.toISOString().slice(0, 10)
      })),
      leaderboard: (leaderboard || []).map(l => ({
        name: l.name,
        value: `₺${l.value.toFixed(2)}`
      })),
      lastConversion: lastConversionData,
      lastClick: lastClickData
    });

  } catch (err) {
    console.error('Dashboard API error:', err);
    return NextResponse.json({ error: "dashboard_fetch_error" }, { status: 500 });
  }
}
