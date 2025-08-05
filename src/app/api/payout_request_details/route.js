export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromRequest, verifyToken } from "@/lib/authOptions";
import { validatecsrf_token } from '@/lib/csrf';

// SECURITY REVIEW: This route uses validatecsrf_token for CSRF protection. Ensure the CSRF secret is strong and not default. Consider per-session/user tokens for higher security.
import { checkRateLimit } from '@/lib/ratelimit';
import { z } from 'zod';

const bodySchema = z.object({ requestId: z.number().int().positive() });

export async function POST(req) {
  try {
    // 1) CSRF
    await validatecsrf_token(req);
    // SECURITY REVIEW: CSRF protection is enabled for this sensitive endpoint. Keep this for all state-changing payout operations.

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
      }
    });
    if (!payoutReq || payoutReq.userId !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // 6) İlgili item’ların sales ID’lerini oku
    const items = await prisma.payoutRequestItem.findMany({
      where: { requestId },
      select: { sourceSaleIds: true }
    });
    const saleIds = items
      .flatMap(i => (i.sourceSaleIds || "").split(',').map(n => Number(n).valueOf()))
      .filter(n => Number.isInteger(n) && n > 0);

    // 7) Satışları çek
    const sales = saleIds.length
      ? await prisma.affiliateUserSale.findMany({
          where: { saleId: { in: saleIds }, userId: userId },
          include: { merchantProduct: { select: { name: true } } }
        })
      : [];

    // 8) JSON cevabı
    return NextResponse.json({
      sales: sales.map(sale => ({
        saleId:       sale.saleId,
        orderId:      sale.orderId,
        product:      sale.merchantProduct?.name || "",
        amount:       Number(sale.amount),
        commission:   Number(sale.commissionAffiliate),
        quantity:     sale.quantity,
        convertedAt:  sale.convertedAt.toISOString().slice(0, 19).replace('T',' ')
      })),
      status:            payoutReq.status,
      request_date:      payoutReq.requestedAt?.toISOString() || "",
      paid_at:           payoutReq.paidAt,
      rejectedReason:    payoutReq.rejectedReason,
      updatedAt:         payoutReq.updatedAt,
      total:             Number(payoutReq.amountTotal),
      iban:              payoutReq.iban || "",
      bankName:          payoutReq.bankName || "",
      realUserFullname:  payoutReq.realUserFullname || "",
      platformPaid:      payoutReq.platformPaid,
      platformPaidAt:    payoutReq.platformPaidAt
    });

  } catch (err) {
    console.error("Payout request details error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
