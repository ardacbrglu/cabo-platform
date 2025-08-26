export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import applyApiSecurityHeaders from "@/lib/headers";

function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

/* CSRF */
function readCsrfCookieValue() {
  const store = cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}
function validateCsrfOrDeny(req) {
  const headerToken = req.headers.get("X-CSRF-Token") || req.headers.get("x-csrf-token") || "";
  const cookieToken = readCsrfCookieValue();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return secureJson({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

async function getAuthedUser(req) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase?.() || null;
  const raw = session?.user?.id ?? session?.user?.userId ?? null;
  let userId = Number.isFinite(Number(raw)) ? Number(raw) : null;
  if (!userId && email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u?.id) userId = u.id;
  }
  if (!userId) return null;
  return { userId, rlKey: makeRateLimitKey(req, { scope: "payout-details", userId }) };
}

const bodySchema = z.object({
  requestId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export async function POST(req) {
  try {
    // Security gates (mutations)
    requireOrigin(req);
    requireAjax(req);
    requireRequestId(req);

    const csrfErr = validateCsrfOrDeny(req);
    if (csrfErr) return applyApiSecurityHeaders(csrfErr, req);

    const info = await getAuthedUser(req);
    if (!info) return applyApiSecurityHeaders(secureJson({ error: "Unauthorized" }, { status: 401 }), req);
    const { userId, rlKey } = info;

    const rl = await checkRateLimit({ key: `${rlKey}:POST`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return applyApiSecurityHeaders(
        secureJson({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }),
        req
      );
    }

    const { requestId, page, pageSize } = bodySchema.parse(await req.json());

    const payoutReq = await prisma.payoutRequest.findUnique({
      where: { requestId },
      include: { payoutRequestItems: true },
    });
    if (!payoutReq || payoutReq.userId !== userId) {
      return applyApiSecurityHeaders(secureJson({ error: "Not authorized" }, { status: 403 }), req);
    }

    // Satışları string parse etmek yerine payoutItemId join'i ile çek
    const itemIds = (payoutReq.payoutRequestItems || []).map((it) => it.itemId);
    const allSales = itemIds.length
      ? await prisma.affiliateUserSale.findMany({
          where: { userId, payoutItemId: { in: itemIds } },
          select: {
            saleId: true,
            orderId: true,
            amount: true,
            commissionAffiliate: true,
            quantity: true,
            convertedAt: true,
            product: { select: { name: true } }, // şemanızdaki relation adı
          },
          orderBy: { convertedAt: "desc" },
        })
      : [];

    const total = allSales.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const sales = allSales.slice(start, start + pageSize).map((s) => ({
      saleId: s.saleId,
      orderId: s.orderId,
      product: s.product?.name || "",
      amount: Number(s.amount || 0),
      commission: Number(s.commissionAffiliate || 0),
      quantity: s.quantity,
      convertedAt: s.convertedAt ? s.convertedAt.toISOString().slice(0, 19).replace("T", " ") : "",
    }));

    return applyApiSecurityHeaders(
      secureJson({
        sales,
        total,
        page,
        totalPages,
        status: payoutReq.status,
        date: payoutReq.requestedAt?.toISOString() || "",
        paid_at: payoutReq.paidAt,
        rejectedReason: payoutReq.rejectedReason,
        updatedAt: payoutReq.updatedAt,
        bankName: payoutReq.bankName || "",
        iban: payoutReq.iban || "",
        realName: payoutReq.realUserFullname || "",
        platform_paid: payoutReq.platformPaid,
        platformPaidAt: payoutReq.platformPaidAt,
      }),
      req
    );
  } catch (err) {
    console.error("Payout request details error:", err);
    return applyApiSecurityHeaders(secureJson({ error: "Server error" }, { status: 500 }), req);
  }
}
