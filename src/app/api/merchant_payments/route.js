// app/api/merchant/payouts/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireRole } from "@/lib/access";

export async function GET(req) {
  try {
    // 1) Session (NextAuth) + rol kontrolü
    const session = await getServerSession(authOptions);
    const user = session?.user || null;
    try {
      requireRole(user, "merchant"); // SECURITY: sadece merchant
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Rate limit (IP veya userId scoped)
    const rlKey = makeRateLimitKey(req, { scope: "merchant-payouts-get", userId: user.id });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 3) Pagination (güvenli parse + sınırlar)
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("limit") || "100", 10) || 100));
    const offset = (page - 1) * limit;

    // 4) Veri çekimi (sadece kendi merchantId’si)
    const rawItems = await prisma.payoutRequestItem.findMany({
      where: {
        merchantId: user.id,
        status: { in: ["pending", "merchant_paid", "platform_confirmed", "rejected"] },
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
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 5) Gruplama + statü önceliği
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
      grouped[key].amount += Number(item.amount) || 0;

      if (statusPriority[item.status] > statusPriority[grouped[key].status]) {
        grouped[key].status = item.status;
      }
    }

    const result = Object.values(grouped);
    const totalCount = result.length;
    const pagedResult = result.slice(offset, offset + limit);

    return NextResponse.json(
      {
        items: pagedResult,
        total: totalCount,
        page,
        pageCount: Math.ceil(totalCount / limit),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/merchant/payouts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
