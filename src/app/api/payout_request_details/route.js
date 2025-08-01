import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit } from '@/lib/ratelimit';
import { z } from 'zod';

const bodySchema = z.object({ request_id: z.number().int().positive() });

export async function POST(req) {
  try {
    // 1) CSRF
    await validateCsrfToken(req);

    // 2) Auth
    const token = getTokenFromRequest(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.user_id;

    // 3) Rate-limit (10 çağrı/dakika)
    if (!checkRateLimit(req, userId, 10, 60_000, 'payout-details')) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 4) Body validation
    const { request_id } = bodySchema.parse(await req.json());

    // 5) Payout request kontrolü
    const payoutReq = await prisma.payoutRequest.findUnique({
      where: { request_id },
      select: {
        user_id: true,
        requested_at: true,
        amount_total: true,
        status: true,
        paid_at: true,
        rejected_reason: true,
        updated_at: true,
        iban: true,
        bank_name: true,
        real_user_fullname: true,
        platform_paid: true,
        platform_paid_at: true,
      }
    });
    if (!payoutReq || payoutReq.user_id !== userId) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // 6) İlgili item’ların sales ID’lerini oku
    const items = await prisma.payout_request_items.findMany({
      where: { request_id },
      select: { source_sale_ids: true }
    });
    const saleIds = items
      .flatMap(i => (i.source_sale_ids || "").split(',').map(n => Number(n).valueOf()))
      .filter(n => Number.isInteger(n) && n > 0);

    // 7) Satışları çek (sayfa/page gerekirse eklenebilir)
    const sales = saleIds.length
      ? await prisma.affiliate_user_sales.findMany({
          where: { sale_id: { in: saleIds }, user_id: userId },
          include: { merchant_products: { select: { name: true } } }
        })
      : [];

    // 8) JSON cevabı
    return NextResponse.json({
      sales: sales.map(sale => ({
        sale_id:       sale.sale_id,
        order_id:      sale.order_id,
        product:       sale.merchant_products?.name || "",
        amount:        Number(sale.amount),
        commission:    Number(sale.commission_affiliate),
        quantity:      sale.quantity,
        converted_at:  sale.converted_at.toISOString().slice(0, 19).replace('T',' ')
      })),
      status:           payoutReq.status,
      request_date:     payoutReq.requested_at?.toISOString() || "",
      paid_at:          payoutReq.paid_at,
      rejected_reason:  payoutReq.rejected_reason,
      updated_at:       payoutReq.updated_at,
      total:            Number(payoutReq.amount_total),
      iban:             payoutReq.iban || "",
      bank_name:        payoutReq.bank_name || "",
      real_user_fullname: payoutReq.real_user_fullname || "",
      platform_paid:      payoutReq.platform_paid,
      platform_paid_at:   payoutReq.platform_paid_at
    });

  } catch (err) {
    console.error("Payout request details error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
