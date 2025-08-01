import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest } from "@/lib/auth";

export async function POST(req) {
  try {
    const user = await getTokenFromRequest(req);
    if (!user || user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const itemIds = body.item_ids;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: "No items selected" }, { status: 400 });
    }

    // Sadece pending ve ilgili merchant'a ait olanları işaretle
    const items = await prisma.payout_request_items.findMany({
      where: {
        item_id: { in: itemIds },
        merchant_id: user.user_id,
        status: "pending",
        payout_requests: { status: "pending" }
      }
    });

    if (!items.length) {
      return NextResponse.json({ error: "No valid items to mark as paid" }, { status: 400 });
    }

    // Toplu olarak status: merchant_paid yap, paid_at doldur
    await prisma.payout_request_items.updateMany({
      where: {
        item_id: { in: items.map(i => i.item_id) }
      },
      data: {
        status: "merchant_paid",
        paid_at: new Date()
      }
    });

    // İlgili payout_request_logs tablosuna log ekle (isteğe bağlı)
    for (const item of items) {
      await prisma.payout_request_logs.create({
        data: {
          item_id: item.item_id,
          request_id: item.request_id,
          user_id: user.user_id,
          action: "merchant_paid",
          old_status: "pending",
          new_status: "merchant_paid",
          note: "Merchant marked as paid"
        }
      });
    }

    return NextResponse.json({ success: true, updated: items.map(i => i.item_id) });
  } catch (err) {
    console.error("Merchant Make Payment Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
