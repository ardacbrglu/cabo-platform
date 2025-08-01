import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

export async function GET(req) {
  try {
    // Auth
    const token = getTokenFromRequest(req);
    const user = token ? verifyToken(token) : null;
    if (!user || user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Pagination
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 100);
    const offset = (page - 1) * limit;

    // Tüm payout_request_items (merchant'ın hem geçmiş hem mevcut itemları)
    const rawItems = await prisma.payout_request_items.findMany({
      where: {
        merchant_id: user.user_id,
        status: { in: ["pending", "merchant_paid", "platform_confirmed", "rejected"] }
      },
      select: {
        item_id: true,
        request_id: true,
        amount: true,
        status: true,
        created_at: true,
        payout_requests: {
          select: {
            user_id: true,
            real_user_fullname: true,
            requested_at: true,
          }
        }
      },
      orderBy: { created_at: "desc" }
    });

    // request_id ve affiliate_id bazında grupla
    const grouped = {};
    for (const item of rawItems) {
      const key = `${item.payout_requests.user_id}_${item.request_id}`;
      if (!grouped[key]) {
        grouped[key] = {
          item_ids: [],
          request_id: item.request_id,
          affiliate_id: item.payout_requests.user_id,
          affiliate_name: item.payout_requests.real_user_fullname || "",
          amount: 0,
          status: item.status, // başlangıçta ilk statü
          requested_at: item.payout_requests.requested_at,
        };
      }
      grouped[key].item_ids.push(item.item_id);
      grouped[key].amount += Number(item.amount);

      // Statü önceliği: platform_confirmed > merchant_paid > pending > rejected
      const statusPriority = {
        platform_confirmed: 3,
        merchant_paid: 2,
        pending: 1,
        rejected: 0,
      };
      if (
        statusPriority[item.status] > statusPriority[grouped[key].status]
      ) {
        grouped[key].status = item.status;
      }
    }

    const result = Object.values(grouped);
    // Pagination
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
