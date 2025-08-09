export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";

// Body şeması
const bodySchema = z.object({
  requestId: z.number().int().positive(),
});

export const POST = withCsrfProtection(async (req) => {
  try {
    // 1) Auth (NextAuth session)
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
      // Var/yok ayrımı sızdırmamak adına generic dönüş
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // 5) İlgili item’ların sales ID’leri
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

    // 6) Satışları çek (sadece bu kullanıcının satışları)
    const sales = saleIds.length
      ? await prisma.affiliateUserSale.findMany({
          where: { saleId: { in: saleIds }, userId: userId },
          include: { merchantProduct: { select: { name: true } } },
        })
      : [];

    // 7) Response
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
        request_date: payoutReq.requestedAt ? payoutReq.requestedAt.toISOString() : "",
        paid_at: payoutReq.paidAt || null,
        rejectedReason: payoutReq.rejectedReason || null,
        updatedAt: payoutReq.updatedAt || null,
        total: Number(payoutReq.amountTotal),
        iban: payoutReq.iban || "",
        bankName: payoutReq.bankName || "",
        realUserFullname: payoutReq.realUserFullname || "",
        platformPaid: payoutReq.platformPaid ?? false,
        platformPaidAt: payoutReq.platformPaidAt || null,
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
