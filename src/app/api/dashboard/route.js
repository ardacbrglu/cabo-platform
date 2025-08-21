export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma için Edge değil

/**
 * File: src/app/api/dashboard/route.js
 * Purpose: Affiliate dashboard özet verileri (güvenli, hızlı, PII-minimal).
 *
 * Security Docblock (Cabo PROD)
 * - Auth: NextAuth session (getServerSession(authOptions)); custom JWT yok.
 * - RBAC: requireRole('affiliate') + requireStatus('active') eşleniği kontrol edilir.
 * - Rate limit: GET 60/dk (IP) + 60/dk (userId). 429'da Retry-After ve retry_after verilir.
 * - Headers: Cache-Control: no-store; Vary: Cookie; global security headers apply.
 * - CSRF: GET için gerekmez. Tüm sorgular Prisma ile yapılır (raw SQL yok).
 * - Audit: Başlıca olaylar audit log'a yazılır (başarı, rate-limit, yetkisizlik).
 * - JSON error contract: { error, request_id, retry_after? }. (UI uyumu için yalnızca success durumda alanlar döner)
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

function deviceFromUA(userAgent = "") {
  const ua = (userAgent || "").toLowerCase();
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac")) return "Mac";
  return "Other";
}

export async function GET(req) {
  const requestId = requireRequestId(req);

  try {
    // 0) IP rate-limit (GET standardı: 60/dk)
    {
      const ipKey = makeRateLimitKey(req, { scope: "dashboard:ip" });
      const { ok, resetMs } = await checkRateLimit({ key: ipKey, limit: 60, windowMs: 60_000 });
      if (!ok) {
        audit({ evt: "dashboard.ratelimit.ip", requestId });
        return json(
          {
            error: "too_many_requests",
            request_id: requestId,
            retry_after: Math.ceil(resetMs / 1000),
          },
          { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
        );
      }
    }

    // 1) Session
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase?.();
    if (!email) {
      audit({ evt: "dashboard.unauthorized", requestId });
      return json({ error: "unauthorized", request_id: requestId }, { status: 401 });
    }

    // 2) Kullanıcı (minimal alanlar)
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
    if (!dbUser) {
      audit({ evt: "dashboard.unauthorized.no_user", email, requestId });
      return json({ error: "unauthorized", request_id: requestId }, { status: 401 });
    }

    // 2.5) User rate-limit (GET standardı: 60/dk)
    {
      const userKey = makeRateLimitKey(req, { scope: "dashboard:user", userId: dbUser.id });
      const { ok, resetMs } = await checkRateLimit({ key: userKey, limit: 60, windowMs: 60_000 });
      if (!ok) {
        audit({ evt: "dashboard.ratelimit.user", userId: dbUser.id, requestId });
        return json(
          {
            error: "too_many_requests",
            request_id: requestId,
            retry_after: Math.ceil(resetMs / 1000),
          },
          { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
        );
      }
    }

    // 3) RBAC
    if (dbUser.role !== "affiliate") {
      audit({ evt: "dashboard.forbidden.role", userId: dbUser.id, role: dbUser.role, requestId });
      return json({ error: "forbidden", request_id: requestId }, { status: 403 });
    }
    if (dbUser.status !== "active") {
      audit({ evt: "dashboard.forbidden.status", userId: dbUser.id, status: dbUser.status, requestId });
      return json({ error: "inactive", request_id: requestId }, { status: 403 });
    }

    const userId = dbUser.id;

    // 4) Platform ayarları (varsayılanla birlikte güvenli okuma)
    let minPayout = 100;
    try {
      const cfg = await prisma.platformConfig.findUnique({ where: { keyName: "min_payout" } });
      if (cfg?.value) {
        const parsed = Number(cfg.value);
        if (!Number.isNaN(parsed)) minPayout = parsed;
      }
    } catch {}

    let platformCommission = 5;
    try {
      const pcfg = await prisma.platformConfig.findUnique({ where: { keyName: "platform_commission" } });
      if (pcfg?.value) {
        const parsed = Number(pcfg.value);
        if (!Number.isNaN(parsed)) platformCommission = parsed;
      }
    } catch {}

    // 5) Banka alan kontrolleri (TR IBAN basit kontrol)
    const iban = dbUser.iban || "";
    const bankName = dbUser.bankName || "";
    const realName = dbUser.realUserFullname || "";
    const ibanMissing = !/^TR\d{24}$/.test(iban);
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(/\s+/).length < 2;

    // 6) Kullanıcı linkleri
    const userLinks = await prisma.affiliateLink.findMany({
      where: { userId },
      select: { productId: true, linkId: true },
    });
    const productIds = userLinks.map((l) => l.productId);
    const linkIds = userLinks.map((l) => l.linkId);

    // Link yoksa boş ama faydalı bir özet döndür (UI ilk yükleme testi için ideal)
    if (productIds.length === 0) {
      audit({ evt: "dashboard.ok.empty", userId, requestId });
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
    const totalSales = Number(totalSalesAgg._sum.quantity || 0);

    const totalEarnAgg = await prisma.affiliateUserSale.aggregate({
      _sum: { commissionAffiliate: true },
      where: { productId: { in: productIds }, userId, status: "confirmed" },
    });
    const totalEarnings = Number(totalEarnAgg._sum.commissionAffiliate || 0);
    const balance = totalEarnings;

    // 8) Son 5 confirmed satış (sadece bu kullanıcı)
    const recentConversions = await prisma.affiliateUserSale.findMany({
      where: { productId: { in: productIds }, status: "confirmed", userId },
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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const lastConversion = await prisma.affiliateUserSale.findFirst({
      where: { userId, status: "confirmed", productId: { in: productIds }, convertedAt: { gte: since } },
      orderBy: { convertedAt: "desc" },
      include: { merchantProduct: { select: { name: true } } },
    });

    const lastClick = await prisma.click.findFirst({
      where: { linkId: { in: linkIds }, clickedAt: { gte: since } },
      orderBy: { clickedAt: "desc" },
      include: { affiliateLink: { include: { product: true } } },
    });

    const lastConversionData = lastConversion
      ? {
          type: "conversion",
          time: lastConversion.convertedAt,
          productName: lastConversion.merchantProduct?.name || "Unknown Product",
          commission: Number(lastConversion.commissionAffiliate || 0),
          quantity: lastConversion.quantity || 1,
        }
      : null;

    const lastClickData = lastClick
      ? {
          type: "click",
          time: lastClick.clickedAt,
          productName: lastClick.affiliateLink?.product?.name || "Unknown Product",
          extra: deviceFromUA(lastClick.userAgent),
        }
      : null;

    // 11) Yanıt (UI ile uyumlu alanlar)
    audit({
      evt: "dashboard.ok",
      userId,
      totals: { clicks: totalClicks, sales: totalSales, earn: totalEarnings },
      requestId,
    });

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
        amount: `+${Number(c.commissionAffiliate || 0).toFixed(2)}₺`,
        desc: `Sale: ${c.merchantProduct?.name || "Product"} (${c.quantity || 1} adet)`,
        date: c.convertedAt.toISOString().slice(0, 10),
      })),
      leaderboard: leaderboard.map((l) => ({ name: l.name, value: `₺${l.value.toFixed(2)}` })),
      lastConversion: lastConversionData,
      lastClick: lastClickData,
    });
  } catch (err) {
    // Üretimde stack sızdırmayalım
    audit({ evt: "dashboard.error", err: String(err?.message || err), requestId });
    return json({ error: "dashboard_fetch_error", request_id: requestId }, { status: 500 });
  }
}
