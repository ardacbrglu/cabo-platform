export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/authOptions";
import { validatecsrf_token } from "@/lib/csrf";

// SECURITY REVIEW: This route uses validatecsrf_token for CSRF protection. Ensure the CSRF secret is strong and not default. Consider per-session/user tokens for higher security.
import { checkRateLimit } from "@/lib/ratelimit";

export async function POST(req) {
  try {
    // 1. CSRF kontrolü
    await validatecsrf_token(req);
    // SECURITY REVIEW: CSRF protection is enabled for this sensitive endpoint. Keep this for all state-changing merchant payment operations.

    // 2. Rate limit (ör: merchant başı 10/dk)
    const user = await getTokenFromRequest(req);
    if (!user || user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!await checkRateLimit(req, user.userId, 10, 60_000, 'merchant-mark-paid')) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // 3. Body parse ve kontrol
    const body = await req.json();
    const itemIds = body.itemIds;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: "No items selected" }, { status: 400 });
    }

    // 4. Pending & ilgili merchant’a ait olanları bul
    const items = await prisma.payoutRequestItem.findMany({
      where: {
        itemId: { in: itemIds },
        merchantId: user.userId,
        status: "pending",
        payoutRequest: { status: "pending" }
      }
    });
    if (!items.length) {
      return NextResponse.json({ error: "No valid items to mark as paid" }, { status: 400 });
    }

    // 5. Toplu olarak update et
    await prisma.payoutRequestItem.updateMany({
      where: {
        itemId: { in: items.map(i => i.itemId) }
      },
      data: {
        status: "merchant_paid",
        paidAt: new Date()
      }
    });

    // 6. Log kaydı (her item için)
    for (const item of items) {
      await prisma.payoutRequestLog.create({
        data: {
          itemId: item.itemId,
          requestId: item.requestId,
          userId: user.userId,
          action: "merchant_paid",
          oldStatus: "pending",
          newStatus: "merchant_paid",
          note: "Merchant marked as paid"
        }
      });
    }

    return NextResponse.json({ success: true, updated: items.map(i => i.itemId) });
  } catch (err) {
    console.error("Merchant Make Payment Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
