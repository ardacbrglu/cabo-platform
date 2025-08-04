export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/authOptions";import { checkRateLimit } from "@/lib/ratelimit";

export async function GET(req) {
  try {
    // Auth & Rate Limit
    const token = getTokenFromRequest(req);
    const user = token ? verifyToken(token) : null;
    if (!user || user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await checkRateLimit(req, user.userId, 30, 60_000, 'merchant-payouts-get');

    // Pagination
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 100)));
    const offset = (page - 1) * limit;

    // payoutRequestItem ve relation mapping doğru olmalı
    const rawItems = await prisma.payoutRequestItem.findMany({
      where: {
        merchantId: user.userId,
        status: { in: ["pending", "merchant_paid", "platform_confirmed", "rejected"] }
      },
      select: {
        itemId: true,
        requestId: true,
        amount: true,
        status: true,
        createdAt: true,
        payoutRequest: {
          select: {
            userId: true,
            realUserFullname: true,
            requestedAt: true,
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // Gruplama ve statü önceliği
    const statusPriority = {
      platform_confirmed: 3,
      merchant_paid: 2,
      pending: 1,
      rejected: 0,
    };

    const grouped = {};
    for (const item of rawItems) {
      const key = `${item.payoutRequest.userId}_${item.requestId}`;
      if (!grouped[key]) {
        grouped[key] = {
          itemIds: [],
          requestId: item.requestId,
          affiliate_id: item.payoutRequest.userId,
          affiliate_name: item.payoutRequest.realUserFullname || "",
          amount: 0,
          status: item.status,
          requested_at: item.payoutRequest.requestedAt,
        };
      }
      grouped[key].itemIds.push(item.itemId);
      grouped[key].amount += Number(item.amount);
      // Statü önceliği
      if (statusPriority[item.status] > statusPriority[grouped[key].status]) {
        grouped[key].status = item.status;
      }
    }

    const result = Object.values(grouped);
    const totalCount = result.length;
    const pagedResult = result.slice(offset, offset + limit);

    return NextResponse.json({
      items: pagedResult,
      total: totalCount,
      page,
      pageCount: Math.ceil(totalCount / limit),
    });

  } catch (error) {
    console.error("Merchant Payments Backend Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
