export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";

// Body şeması (sayfalama opsiyonel)
const bodySchema = z.object({
  requestId: z.number().int().positive(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(), // üst sınır
});

export const POST = withCsrfProtection(async (req) => {
  try {
    // 1) Auth
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Rate limit (kullanıcı bazlı 10/dk)
    const rlKey = makeRateLimitKey(req, { scope: "payout-details", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 3) Body parse + validation
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const { requestId } = parsed.data;
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 10;

    // 4) Payout request kontrol (sadece sahibine göster)
    const payoutReq = await prisma.payoutRequest.findUnique({
      where: { requestId },
      select: {
        userId: true,
        requestedAt: true,
        amountTotal: true,
        status: true,
        paidAt: true,
        rejectedReason: true,
        updatedAt: true,
        iban: true,
        bankName: true,
        realUserFullname: true,
        platformPaid: true,
        platformPaidAt: true,
      },
    });

    if (!payoutReq || payoutReq.userId !== userId) {
      // Var/yok ayrımı sızdırmamak için generic hata
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // 5) İlgili item’ların satış ID’leri
    const items = await prisma.payoutRequestItem.findMany({
      where: { requestId },
      select: { sourceSaleIds: true },
    });

    const saleIds = items
      .flatMap((i) =>
        String(i.sourceSaleIds || "")
          .split(",")
          .map((s) => Number(s.trim()))
      )
      .filter((n) => Number.isInteger(n) && n > 0);

    // 6) Satışları çek + sayfalama
    let totalSales = 0;
    let sales = [];
    if (saleIds.length) {
      // total count
      totalSales = await prisma.affiliateUserSale.count({
        where: { saleId: { in: saleIds }, userId },
      });

      // sayfalı fetch
      const skip = (page - 1) * pageSize;
      sales = await prisma.affiliateUserSale.findMany({
        where: { saleId: { in: saleIds }, userId },
        include: { merchantProduct: { select: { name: true } } },
        orderBy: { saleId: "desc" },
        skip,
        take: pageSize,
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalSales / pageSize));

    // 7) Response (frontend’in beklediği isimlerle)
    return NextResponse.json(
      {
        sales: sales.map((sale) => ({
          saleId: sale.saleId,
          orderId: sale.orderId,
          product: sale.merchantProduct?.name || "",
          amount: Number(sale.amount),
          commission: Number(sale.commissionAffiliate),
          quantity: sale.quantity,
          convertedAt: sale.convertedAt
            ? sale.convertedAt.toISOString().slice(0, 19).replace("T", " ")
            : "",
        })),
        status: payoutReq.status,
        date: payoutReq.requestedAt ? payoutReq.requestedAt.toISOString() : "",
        paid_at: payoutReq.paidAt ? payoutReq.paidAt.toISOString() : null,
        rejectedReason: payoutReq.rejectedReason || null,
        updatedAt: payoutReq.updatedAt ? payoutReq.updatedAt.toISOString() : null,
        total: Number(payoutReq.amountTotal),
        iban: payoutReq.iban || "",
        bankName: payoutReq.bankName || "",
        realName: payoutReq.realUserFullname || "",
        platform_paid: Boolean(payoutReq.platformPaid),
        platformPaidAt: payoutReq.platformPaidAt ? payoutReq.platformPaidAt.toISOString() : null,
        page,
        pageSize,
        totalPages,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Vary": "Cookie",
        },
      }
    );
  } catch (err) {
    console.error("Payout request details error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
