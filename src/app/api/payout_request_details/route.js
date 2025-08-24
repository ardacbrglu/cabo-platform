export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

async function finalizeExpiredPayouts(userId) {
  const threshold = new Date(Date.now() - CANCELLATION_WINDOW_MS);
  await prisma.payoutRequest.updateMany({
    where: { userId, status: "pending", requestedAt: { lte: threshold } },
    data: { status: "approved", updatedAt: new Date() },
  });
}

const bodySchema = z.object({
  requestId: z.number().int().positive(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export const POST = withCsrfProtection(async (req) => {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? session?.user?.userId;
    if (!userId) return secureJson({ error: "Unauthorized" }, { status: 401 });

    // rate limit
    const rlKey = makeRateLimitKey(req, { scope: "payout-details", userId: Number(userId) });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    if (!ok) {
      return secureJson(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return secureJson({ error: "Invalid payload" }, { status: 400 });

    const { requestId } = parsed.data;
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 10;

    // pending → approved (24h) kontrolü
    await finalizeExpiredPayouts(Number(userId));

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

    if (!payoutReq || payoutReq.userId !== Number(userId)) {
      return secureJson({ error: "Not authorized" }, { status: 403 });
    }

    const items = await prisma.payoutRequestItem.findMany({
      where: { requestId },
      select: { sourceSaleIds: true, status: true },
    });

    const saleIds = items
      .flatMap((i) => String(i.sourceSaleIds || "").split(",").map((s) => Number(s.trim())))
      .filter((n) => Number.isInteger(n) && n > 0);

    let totalSales = 0;
    let sales = [];
    if (saleIds.length) {
      totalSales = await prisma.affiliateUserSale.count({ where: { saleId: { in: saleIds }, userId: Number(userId) } });
      const skip = (page - 1) * pageSize;
      sales = await prisma.affiliateUserSale.findMany({
        where: { saleId: { in: saleIds }, userId: Number(userId) },
        include: { merchantProduct: { select: { name: true } } },
        orderBy: { saleId: "desc" },
        skip,
        take: pageSize,
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalSales / pageSize));

    const requestedAtMs = payoutReq.requestedAt ? new Date(payoutReq.requestedAt).getTime() : 0;
    const lockAt = requestedAtMs ? new Date(requestedAtMs + CANCELLATION_WINDOW_MS) : null;
    const progressed = items.some((it) => it.status === "merchant_paid" || it.status === "platform_confirmed");
    const now = Date.now();
    const locked = payoutReq.status !== "pending" || progressed || (lockAt && now >= lockAt.getTime());

    return secureJson(
      {
        sales: sales.map((sale) => ({
          saleId: sale.saleId,
          orderId: sale.orderId,
          product: sale.merchantProduct?.name || "",
          amount: Number(sale.amount),
          commission: Number(sale.commissionAffiliate),
          quantity: sale.quantity,
          convertedAt: sale.convertedAt ? sale.convertedAt.toISOString().slice(0, 19).replace("T", " ") : "",
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

        // FE yardımcı alanlar:
        lockAt: lockAt ? lockAt.toISOString() : null,
        canCancel: payoutReq.status === "pending" && !locked,
        canEditBank: payoutReq.status === "pending" && !locked,
        secondsLeft: lockAt ? Math.max(0, Math.floor((lockAt.getTime() - now) / 1000)) : 0,
      },
      { headers: { "Cache-Control": "no-store", "Vary": "Cookie" } }
    );
  } catch (err) {
    console.error("Payout request details error:", err);
    return secureJson({ error: "Server error" }, { status: 500 });
  }
});
