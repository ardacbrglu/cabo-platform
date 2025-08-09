// app/api/wallet/route.js
// Sorumluluk: Affiliate kullanıcının onaylı satışlarından payout isteği oluşturma
// SECURITY: NextAuth session, role kontrolü, CSRF, rate‑limit, generic error, TX ile atomiklik

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

// Opsiyonel: platform_config tablosundan min payout oku; yoksa 100 TL
async function getMinPayoutTRY() {
  try {
    const row = await prisma.platformConfig.findUnique({
      where: { keyName: "min_payout_try" },
      select: { value: true },
    });
    const v = row?.value ? Number(row.value) : NaN;
    return Number.isFinite(v) ? v : 100;
  } catch {
    return 100;
  }
}

// POST /api/wallet  body: { requestPayout: true }
export const POST = withCsrfProtection(async (req) => {
  // 1) Auth + role
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "affiliate") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2) Rate limit (kullanıcı başı 3 istek / saat)
  const rlKey = makeRateLimitKey(req, { scope: `wallet_payout_user_${userId}` });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 3, windowMs: 60 * 60 * 1000 });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs ?? 0) / 1000)) } }
    );
  }

  // 3) Body parse/validate
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const requestPayout = Boolean(body?.requestPayout);
  if (!requestPayout) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // 4) Kullanıcının payout bilgileri mevcut mu?
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bankName: true, iban: true, realUserFullname: true, status: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.status !== "active") {
    return NextResponse.json({ error: "Account is not active." }, { status: 403 });
  }
  if (!user.bankName || !user.iban || !user.realUserFullname) {
    return NextResponse.json(
      { error: "Please complete your bank information before requesting a payout." },
      { status: 400 }
    );
  }

  // 5) Bu kullanıcının görünür linkleri (My Links) üstünden satışları topla
  const links = await prisma.affiliateLink.findMany({
    where: { userId, isVisible: true },
    select: { productId: true },
  });
  const productIds = links.map((l) => l.productId);
  if (productIds.length === 0) {
    return NextResponse.json({ error: "No eligible sales." }, { status: 400 });
  }

  // 6) Ödenmemiş onaylı satışları çek
  const sales = await prisma.affiliateUserSale.findMany({
    where: {
      userId,
      status: "confirmed",
      payoutItemId: null,
      productId: { in: productIds },
    },
    select: {
      saleId: true,
      merchantId: true,
      productId: true,
      commissionAffiliate: true,
    },
  });

  if (sales.length === 0) {
    return NextResponse.json({ error: "No eligible sales." }, { status: 400 });
  }

  // 7) Toplam tutar ve min payout kontrolü
  const totalAmount = sales.reduce(
    (sum, s) => sum + Number(s.commissionAffiliate || 0),
    0
  );
  const minPayout = await getMinPayoutTRY();
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return NextResponse.json({ error: "No eligible sales." }, { status: 400 });
  }
  if (totalAmount < minPayout) {
    return NextResponse.json(
      { error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` },
      { status: 400 }
    );
  }

  // 8) merchantId + productId bazında gruplandır
  const grouped = new Map(); // key: `${merchantId}-${productId}` -> { amount, saleIds, merchantId, productId }
  for (const s of sales) {
    const key = `${s.merchantId}-${s.productId}`;
    const g = grouped.get(key) ?? {
      amount: 0,
      saleIds: [],
      merchantId: s.merchantId,
      productId: s.productId,
    };
    g.amount += Number(s.commissionAffiliate || 0);
    g.saleIds.push(s.saleId);
    grouped.set(key, g);
  }

  const payoutItemsCreate = Array.from(grouped.values()).map((g) => ({
    merchantId: g.merchantId,
    productId: g.productId,
    amount: g.amount,
    sourceSaleIds: g.saleIds.join(","),
  }));

  // 9) Transaction: payoutRequest + items + satışlara itemId yaz
  try {
    const result = await prisma.$transaction(async (tx) => {
      const payoutReq = await tx.payoutRequest.create({
        data: {
          userId,
          amountTotal: totalAmount,
          status: "pending",
          bankName: user.bankName,
          iban: user.iban,
          realUserFullname: user.realUserFullname,
          platformPaid: false,
          payoutRequestItems: { create: payoutItemsCreate },
        },
        include: { payoutRequestItems: true },
      });

      for (const item of payoutReq.payoutRequestItems) {
        const saleIds = item.sourceSaleIds.split(",").map((n) => Number(n)).filter(Boolean);
        if (saleIds.length) {
          await tx.affiliateUserSale.updateMany({
            where: { saleId: { in: saleIds } },
            data: { payoutItemId: item.itemId },
          });
        }
      }

      await tx.payoutRequestLog.create({
        data: {
          requestId: payoutReq.requestId,
          userId,
          action: "create",
          newStatus: "pending",
          note: `Payout request created. Amount: ${totalAmount}`,
        },
      });

      return payoutReq.requestId;
    });

    return NextResponse.json({ ok: true, message: "Payout request created", requestId: result });
  } catch (e) {
    // DB hataları dahil generic mesaj
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
