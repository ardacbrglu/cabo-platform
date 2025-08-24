// app/api/merchant_webhook_logs/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SECURITY
 * - Auth: NextAuth session zorunlu
 * - RBAC: role === "merchant"
 * - Ratelimit: userId scoped, 30 req/min
 * - Data minimization: ham header/raw body dönülmez
 * - Cache: no-store
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { requireRole } from "@/lib/authz";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

export async function GET(req) {
  try {
    // 1) Auth + RBAC
    const session = await getServerSession(authOptions);
    const user = session?.user || null;
    try {
      requireRole(user, "merchant");
    } catch {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Rate limit
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
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
      );
    }

    // 3) Pagination
    const { searchParams } = new URL(req.url);
    const p = parseInt(searchParams.get("page") || "1", 10);
    const l = parseInt(searchParams.get("limit") || "20", 10);
    const page = Number.isFinite(p) && p > 0 ? p : 1;
    const limit = Number.isFinite(l) && l > 0 ? Math.min(100, l) : 20;
    const offset = (page - 1) * limit;

    // 4) Logs + count (yalnızca kendi merchant'ı)
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
              amount: true,               // unit price
              quantity: true,
              commissionAffiliate: true,
              status: true,               // "confirmed" ise kabul
            },
          },
        },
      }),
      prisma.webhookRequestLog.count({
        where: { merchantId: Number(user.id) },
      }),
    ]);

    // 5) Özetler (sadece confirmed satışlar dahil)
    const items = logs.map((log) => {
      let totalAmountAccepted = 0;
      let totalCommission = 0;
      for (const s of log.sales) {
        if (s.status === "confirmed") {
          const unit = Number(s.amount || 0);
          const qty = Number(s.quantity || 0);
          totalAmountAccepted += unit * qty;
          totalCommission += Number(s.commissionAffiliate || 0);
        }
      }
      return {
        id: log.id,
        sentAt: log.sentAt ? new Date(log.sentAt).toISOString() : null,
        receivedAt: log.receivedAt ? new Date(log.receivedAt).toISOString() : null,
        status: log.status,
        totalAmountAccepted,
        totalCommission,
      };
    });

    return json({
      items,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) {
    console.error("GET /api/merchant_webhook_logs error:", e);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
