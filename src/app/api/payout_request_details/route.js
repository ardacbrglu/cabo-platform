// /app/api/payout_request_details/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Security Docblock
 * - Auth: NextAuth session required; user must own the payout request.
 * - CSRF: NextAuth double-submit cookie check (header X-CSRF-Token vs cookie).
 * - Headers: Origin/Referer check, X-Requested-With, X-Request-Id.
 * - Ratelimit: POST 10/min (IP+userId scope: payout-details).
 * - Validation: Zod (requestId, pagination, bank info).
 * - Privacy: no-store; set strict security headers.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";
import { cookies } from "next/headers";
import applyApiSecurityHeaders from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import {
  payoutRequestIdSchema,
  updateRequestBankSchema,
  normalizeIban, // import edilip snapshot yazarken tutarlı kalalım
} from "@/lib/validation";

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function secureJson(data, init = {}, req) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return applyApiSecurityHeaders(res, req);
}
const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

function readCsrfCookieValue() {
  const store = cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}
function validateCsrfOrDeny(req) {
  const headerToken =
    req.headers.get("X-CSRF-Token") || req.headers.get("x-csrf-token") || "";
  const cookieToken = readCsrfCookieValue();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return secureJson({ error: "Invalid CSRF token" }, { status: 403 }, req);
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

async function getPlatformCommissionPercent() {
  const cfg = await prisma.platformConfig.findUnique({
    where: { keyName: "platform_commission_percent" },
  });
  const n = cfg ? Number(cfg.value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

export async function POST(req) {
  try {
    const csrfErr = validateCsrfOrDeny(req);
    if (csrfErr) return csrfErr;

    try {
      requireOrigin(req);
      requireAjax(req);
      requireRequestId(req);
    } catch (e) {
      return secureJson(
        { error: e.message, code: e.code || "BAD_REQUEST" },
        { status: e.status || 400 },
        req
      );
    }

    const info = await getAuthedUser(req);
    if (!info) return secureJson({ error: "Unauthorized" }, { status: 401 }, req);
    const { userId, rlKey } = info;

    const rl = await checkRateLimit({ key: `${rlKey}:POST`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return secureJson(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
        req
      );
    }

    const body = await req.json();

    /* (A) — Bu talebin banka snapshot’ını güncelle (users tablosuna dokunma) */
    if (body && body.updateRequestBank === true) {
      const parsed = updateRequestBankSchema.safeParse(body);
      if (!parsed.success) {
        return secureJson({ error: "Invalid bank info for update" }, { status: 400 }, req);
      }
      const { requestId, iban, bankName, realName } = parsed.data;

      const reqItem = await prisma.payoutRequest.findUnique({
        where: { requestId },
        select: {
          userId: true,
          status: true,
          requestedAt: true,
          payoutRequestItems: { select: { status: true } },
        },
      });
      if (!reqItem || reqItem.userId !== userId || reqItem.status !== "pending") {
        return secureJson({ error: "Not authorized" }, { status: 403 }, req);
      }

      const progressed = (reqItem.payoutRequestItems || []).some(
        (itm) => itm.status === "merchant_paid" || itm.status === "platform_confirmed"
      );
      const lockAt =
        reqItem.requestedAt
          ? new Date(reqItem.requestedAt).getTime() + CANCELLATION_WINDOW_MS
          : 0;
      const now = Date.now();
      if (progressed || now >= lockAt) {
        return secureJson(
          { error: "LOCKED", message: "This payout request is locked and cannot be updated." },
          { status: 400 },
          req
        );
      }

      await prisma.payoutRequest.update({
        where: { requestId },
        data: {
          bankName,
          iban: normalizeIban(iban),
          realUserFullname: realName,
          updatedAt: new Date(),
        },
      });
      await prisma.payoutRequestLog.create({
        data: {
          requestId,
          userId,
          action: "update_bank",
          oldstatus: "pending",
          newstatus: "pending",
          note: "User updated payout request bank snapshot",
        },
      });
      return secureJson({ ok: true }, {}, req);
    }

    /* (B) — Detayları getir */
    const { requestId, page, pageSize } = bodySchema.parse(body);

    const payoutReq = await prisma.payoutRequest.findUnique({
      where: { requestId },
      select: {
        userId: true,
        status: true,
        requestedAt: true,
        paidAt: true,
        rejectedReason: true,
        updatedAt: true,
        bankName: true,
        iban: true,
        realUserFullname: true,
        platformPaid: true,
        platformPaidAt: true,
        amountTotal: true,
        payoutRequestItems: { select: { status: true, sourceSaleIds: true } },
      },
    });
    if (!payoutReq || payoutReq.userId !== userId) {
      return secureJson({ error: "Not authorized" }, { status: 403 }, req);
    }

    const platformCommissionPercent = await getPlatformCommissionPercent();

    const saleIds = (payoutReq.payoutRequestItems || [])
      .flatMap((it) => String(it.sourceSaleIds || "").split(","))
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);

    let allSales = [];
    if (saleIds.length) {
      allSales = await prisma.affiliateUserSale.findMany({
        where: { saleId: { in: saleIds }, userId },
        select: {
          saleId: true,
          orderId: true,
          amount: true,
          commissionAffiliate: true,
          quantity: true,
          convertedAt: true,
          merchantProduct: { select: { name: true } },
        },
        orderBy: { convertedAt: "desc" },
      });
    }

    const total = allSales.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;

    const sales = allSales.slice(start, start + pageSize).map((s) => {
      const productName = s.merchantProduct?.name || "";
      const aff = Number(s.commissionAffiliate || 0);
      const platformFee = round2(aff * (platformCommissionPercent / 100));
      return {
        saleId: s.saleId,
        orderId: s.orderId,
        product: productName,
        amount: round2(s.amount || 0),
        commission: round2(aff),
        platformFee,
        quantity: s.quantity,
        convertedAt: s.convertedAt
          ? s.convertedAt.toISOString().slice(0, 19).replace("T", " ")
          : "",
      };
    });

    const amountTotal = round2(Number(payoutReq.amountTotal || 0));
    const platformCommissionTotal = round2(amountTotal * (platformCommissionPercent / 100));
    const netPayable = round2(amountTotal - platformCommissionTotal);

    const requestedAtMs = payoutReq.requestedAt ? new Date(payoutReq.requestedAt).getTime() : 0;
    const lockAt = requestedAtMs ? new Date(requestedAtMs + CANCELLATION_WINDOW_MS) : null;
    const progressed = (payoutReq.payoutRequestItems || []).some(
      (itm) => itm.status === "merchant_paid" || itm.status === "platform_confirmed"
    );
    const canEditBank =
      payoutReq.status === "pending" &&
      !progressed &&
      lockAt &&
      Date.now() < lockAt.getTime();

    return secureJson(
      {
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

        amountTotal,
        platformCommissionPercent,
        platformCommissionTotal,
        netPayable,

        lockAt: lockAt ? lockAt.toISOString() : null,
        canEditBank,
      },
      {},
      req
    );
  } catch (err) {
    console.error("Payout request details error:", err);
    return secureJson({ error: "Server error" }, { status: 500 }, req);
  }
}
