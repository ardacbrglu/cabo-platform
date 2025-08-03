import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit } from '@/lib/ratelimit';
import { z } from 'zod';

const bodySchema = z.object({ requestId: z.number().int().positive() });

export async function POST(req) {
  try {
    // 1) CSRF
    await validateCsrfToken(req);

    // 2) Auth
    const token = getTokenFromRequest(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.userId;

    // 3) Rate-limit (10 çağrı/dakika)
    if (!checkRateLimit(req, userId, 10, 60_000, 'payout-details')) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 4) Body validation
    const { requestId } = bodySchema.parse(await req.json());

    // 5) Payout request kontrolü
    const payoutReq = await prisma.payoutRequest.findUnique({
      where: { requestId },
      select: {
        userId: true,
        requested_at: true,
        amountTotal: true,
        status: true,
        paid_at: true,
        rejectedReason: true,
        updatedAt: true,
        iban: true,
        bankName: true,
        realUserFullname: true,
        platform_paid: true,
        platformPaidAt: true,
      }
    });
    if (!payoutReq || payoutReq.userId !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // 6) İlgili item’ların sales ID’lerini oku
    const items = await prisma.payoutRequestItems.findMany({
      where: { requestId },
      select: { source_saleIds: true }
    });
    const saleIds = items
      .flatMap(i => (i.source_saleIds || "").split(',').map(n => Number(n).valueOf()))
      .filter(n => Number.isInteger(n) && n > 0);

    // 7) Satışları çek (sayfa/page gerekirse eklenebilir)
    const sales = saleIds.length
      ? await prisma.affiliate_user_sales.findMany({
          where: { saleId: { in: saleIds }, userId: userId },
          include: { merchantProducts: { select: { name: true } } }
        })
      : [];

    // 8) JSON cevabı
    return NextResponse.json({
      sales: sales.map(sale => ({
        saleId:       sale.saleId,
        orderId:      sale.orderId,
        product:       sale.merchantProducts?.name || "",
        amount:        Number(sale.amount),
        commission:    Number(sale.commissionAffiliate),
        quantity:      sale.quantity,
        convertedAt:  sale.convertedAt.toISOString().slice(0, 19).replace('T',' ')
      })),
      status:           payoutReq.status,
      request_date:     payoutReq.requested_at?.toISOString() || "",
      paid_at:          payoutReq.paid_at,
      rejectedReason:  payoutReq.rejectedReason,
      updatedAt:       payoutReq.updatedAt,
      total:            Number(payoutReq.amountTotal),
      iban:             payoutReq.iban || "",
      bankName:        payoutReq.bankName || "",
      realUserFullname: payoutReq.realUserFullname || "",
      platform_paid:      payoutReq.platform_paid,
      platformPaidAt:   payoutReq.platformPaidAt
    });

  } catch (err) {
    console.error("Payout request details error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
