// app/api/merchant_webhook_logs/route.js
export const dynamic = "force-dynamic";

/**
 * SECURITY NOTES
 * - Auth: NextAuth zorunlu (getServerSession).
 * - RBAC: Sadece role === "merchant" erişebilir (requireRole).
 * - Rate limit: userId + scope ile 30/dk.
 * - Data minimization: rawBody/headers gibi hassas alanlar DÖNMEZ.
 * - Cache: no-store.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireRole } from "@/lib/authz";

export async function GET(req) {
  try {
    // 1) Session + RBAC
    const session = await getServerSession(authOptions);
    const user = session?.user || null;
    try {
      requireRole(user, "merchant"); // status!=active ise burada da engelleyebilirsiniz.
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Rate limit (30 req/dk)
    const rlKey = makeRateLimitKey(req, {
      scope: "merchant-webhook-logs-list",
      userId: user.id,
    });
    const { ok, resetMs } = await checkRateLimit({
      key: rlKey,
      limit: 30,
      windowMs: 60_000,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) },
        }
      );
    }

    // 3) Pagination
    const { searchParams } = new URL(req.url);
    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(100, limitParam)
        : 20;
    const offset = (page - 1) * limit;

    // 4) Kendi loglarını getir (satış özetleri için sales ilişkisini seçiyoruz)
    const [logs, total] = await Promise.all([
      prisma.webhookRequestLog.findMany({
        where: { merchantId: Number(user.id) },
        orderBy: { id: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          sentAt: true,
          receivedAt: true,
          status: true,
          sales: {
            select: {
              amount: true,
              quantity: true,
              commissionAffiliate: true,
              status: true,
            },
          },
        },
      }),
      prisma.webhookRequestLog.count({
        where: { merchantId: Number(user.id) },
      }),
    ]);

    // 5) accepted sale’lerden toplamları hesapla
    const items = logs.map((log) => {
      let totalAmountAccepted = 0;
      let totalCommission = 0;

      for (const s of log.sales) {
        if (s.status === "confirmed") {
          const lineTotal =
            Number(s.amount || 0) * Number(s.quantity || 0);
          totalAmountAccepted += lineTotal;
          totalCommission += Number(s.commissionAffiliate || 0);
        }
      }

      return {
        id: log.id,
        sentAt: log.sentAt ? new Date(log.sentAt).toISOString() : null,
        receivedAt: log.receivedAt
          ? new Date(log.receivedAt).toISOString()
          : null,
        status: log.status,
        totalAmountAccepted,
        totalCommission,
      };
    });

    return NextResponse.json(
      {
        items,
        total,
        page,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
    );
  } catch (err) {
    console.error("GET /api/merchant_webhook_logs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
