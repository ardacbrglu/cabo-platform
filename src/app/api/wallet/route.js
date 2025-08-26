export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";
import { cookies } from "next/headers";
import { isIbanTR, bankInfoSchema, payoutRequestIdSchema } from "@/lib/validation";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import applyApiSecurityHeaders from "@/lib/headers";

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

/* -------- CSRF -------- */
function readCsrfCookieValue() {
  const store = cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}
function validateCsrfOrDeny(req) {
  const method = req?.method?.toUpperCase?.() || "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  const headerToken = req.headers.get("X-CSRF-Token") || req.headers.get("x-csrf-token") || "";
  const cookieToken = readCsrfCookieValue();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return secureJson({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

/* -------- helpers -------- */
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const cleanBankName = (s) => String(s || "").trim().slice(0, 120);
const cleanRealName = (s) => String(s || "").trim().replace(/\s+/g, " ").slice(0, 120);
const normalizeIban = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();

async function getMinPayout() {
  for (const key of ["min_payout", "min_payout_try"]) {
    const cfg = await prisma.platformConfig.findUnique({ where: { keyName: key } });
    const v = cfg ? Number(cfg.value) : NaN;
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 100;
}
async function finalizeExpiredPayouts(userId) {
  const threshold = new Date(Date.now() - CANCELLATION_WINDOW_MS);
  await prisma.payoutRequest.updateMany({
    where: { userId, status: "pending", requestedAt: { lte: threshold } },
    data: { status: "approved", updatedAt: new Date() },
  });
}
async function getAuthedUser(req) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role || null;
  const email = session?.user?.email?.toLowerCase?.() || null;

  const raw = session?.user?.id ?? session?.user?.userId ?? null;
  let userId = Number.isFinite(Number(raw)) ? Number(raw) : null;

  if (!userId && email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u?.id) userId = u.id;
  }
  if (!userId) return null;
  return { userId, role, rlKey: makeRateLimitKey(req, { scope: "wallet", userId }) };
}

/* ================= GET ================= */
export async function GET(req) {
  try {
    const info = await getAuthedUser(req);
    if (!info) return applyApiSecurityHeaders(secureJson({ error: "Unauthorized" }, { status: 401 }), req);
    const { userId, rlKey, role } = info;
    if (!role) return applyApiSecurityHeaders(secureJson({ error: "Unauthorized" }, { status: 401 }), req);

    const rl = await checkRateLimit({ key: `${rlKey}:GET`, limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return applyApiSecurityHeaders(
        secureJson({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }),
        req
      );
    }

    await finalizeExpiredPayouts(userId);
    const minPayout = await getMinPayout();

    const links = await prisma.affiliateLink.findMany({ where: { userId }, select: { productId: true } });
    const productIds = links.map((l) => l.productId);

    const confirmedSales = await prisma.affiliateUserSale.findMany({
      where: { userId, status: "confirmed", payoutItemId: null, ...(productIds.length ? { productId: { in: productIds } } : {}) },
      select: { commissionAffiliate: true },
    });
    const confirmed = confirmedSales.reduce((s, r) => s + Number(r.commissionAffiliate || 0), 0);

    const pendingSales = await prisma.affiliateUserSale.findMany({
      where: { userId, status: "pending", payoutItemId: null, ...(productIds.length ? { productId: { in: productIds } } : {}) },
      select: { commissionAffiliate: true },
    });
    const pending = pendingSales.reduce((s, r) => s + Number(r.commissionAffiliate || 0), 0);

    const balance = confirmed + pending;

    const user = (await prisma.user.findUnique({
      where: { id: userId },
      select: { iban: true, bankName: true, realUserFullname: true },
    })) || {};

    const iban = user.iban || "";
    const bankName = user.bankName || "";
    const realName = user.realUserFullname || "";

    const ibanMissing = !isIbanTR(iban);
    const bankMissing = !cleanBankName(bankName);
    const realNameMissing = cleanRealName(realName).split(" ").length < 2;

    const historyRaw = await prisma.payoutRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: { payoutRequestItems: { select: { status: true } } },
    });

    const now = Date.now();
    const history = historyRaw.map((item) => {
      const requestedAtMs = item.requestedAt ? new Date(item.requestedAt).getTime() : 0;
      const lockAt = requestedAtMs ? new Date(requestedAtMs + CANCELLATION_WINDOW_MS) : null;
      const progressed = (item.payoutRequestItems || []).some(
        (it) => it.status === "merchant_paid" || it.status === "platform_confirmed"
      );
      const locked = item.status !== "pending" || (lockAt && now >= lockAt.getTime()) || progressed;

      return {
        requestId: item.requestId,
        date: item.requestedAt?.toISOString().slice(0, 10) || "",
        amount: Number(item.amountTotal),
        status: item.status,
        method: "IBAN",
        bankName: item.bankName || "",
        iban: item.iban || "",
        realName: item.realUserFullname || "",
        platform_paid: !!item.platformPaid,
        platformPaidAt: item.platformPaidAt,
        paid_at: item.paidAt,
        rejectedReason: item.rejectedReason,
        updatedAt: item.updatedAt,
        lockAt: lockAt ? lockAt.toISOString() : null,
        canCancel: item.status === "pending" && !locked,
        canEditBank: item.status === "pending" && !locked,
      };
    });

    return applyApiSecurityHeaders(
      secureJson({
        balance,
        confirmed,
        pending,
        minPayout,
        iban,
        bankName,
        realName,
        ibanMissing,
        bankMissing,
        realNameMissing,
        hasPendingRequest: history.some((h) => h.status === "pending"),
        pendingAmount: history.filter((h) => h.status === "pending").reduce((s, h) => s + Number(h.amount || 0), 0),
        history,
      }),
      req
    );
  } catch (err) {
    console.error("Wallet API GET error:", err);
    return applyApiSecurityHeaders(secureJson({ error: "Server error" }, { status: 500 }), req);
  }
}

/* ================= POST ================= */
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
    const { userId, rlKey, role } = info;
    if (!role) return applyApiSecurityHeaders(secureJson({ error: "Unauthorized" }, { status: 401 }), req);
    if (role !== "affiliate") return applyApiSecurityHeaders(secureJson({ error: "Forbidden" }, { status: 403 }), req);

    const rl = await checkRateLimit({ key: `${rlKey}:POST`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return applyApiSecurityHeaders(
        secureJson({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }),
        req
      );
    }

    const raw = await req.json().catch(() => ({}));
    if (!isObj(raw)) return applyApiSecurityHeaders(secureJson({ error: "Invalid request body" }, { status: 400 }), req);

    const minPayout = await getMinPayout();

    /* ---- (1) Profil banka kaydet ---- */
    if ("iban" in raw && "bankName" in raw && "realName" in raw &&
        !("updateRequestBank" in raw) && !("requestPayout" in raw) && !("cancelRequest" in raw)) {
      const clean = {
        iban: normalizeIban(raw.iban),
        bankName: raw.bankName,
        realName: raw.realName,
      };
      const parsed = bankInfoSchema.safeParse(clean);
      if (!parsed.success) {
        const issues = parsed.error.issues?.map((i) => i.path.join(".") + ": " + i.message).join("; ");
        return applyApiSecurityHeaders(secureJson({ error: issues || "Invalid bank info" }, { status: 400 }), req);
      }
      const { iban, bankName, realName } = parsed.data;
      await prisma.user.update({ where: { id: userId }, data: { iban, bankName, realUserFullname: realName } });
      return applyApiSecurityHeaders(secureJson({ ok: true, message: "Bank info saved" }), req);
    }

    /* ---- (2) Payout talebi ---- */
    if (raw.requestPayout === true) {
      const idemKey =
        req.headers.get("X-Idempotency-Key") ||
        req.headers.get("x-idempotency-key") ||
        req.headers.get("idempotency-key") || null;

      if (idemKey) {
        const dup = await prisma.payoutRequest.findFirst({ where: { userId, idempotencyKey: idemKey }, select: { requestId: true } });
        if (dup) return applyApiSecurityHeaders(secureJson({ ok: true, message: "Payout request already created", requestId: dup.requestId }), req);
      }

      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { iban: true, bankName: true, realUserFullname: true, status: true },
      });
      if (!u || u.status !== "active") return applyApiSecurityHeaders(secureJson({ error: "Account is not active." }, { status: 403 }), req);

      const iban = normalizeIban(u.iban || "");
      const bankName = u.bankName || "";
      const realName = u.realUserFullname || "";
      if (!isIbanTR(iban)) return applyApiSecurityHeaders(secureJson({ error: "Please save a valid IBAN first." }, { status: 400 }), req);
      if (!cleanBankName(bankName)) return applyApiSecurityHeaders(secureJson({ error: "Please save your bank name first." }, { status: 400 }), req);
      if (cleanRealName(realName).split(" ").length < 2) return applyApiSecurityHeaders(secureJson({ error: "Please save your full real name first." }, { status: 400 }), req);

      const links = await prisma.affiliateLink.findMany({ where: { userId, isVisible: true }, select: { productId: true } });
      const productIds = links.map((l) => l.productId);
      if (!productIds.length) return applyApiSecurityHeaders(secureJson({ error: "No eligible sales." }, { status: 400 }), req);

      const sales = await prisma.affiliateUserSale.findMany({
        where: { userId, status: "confirmed", payoutItemId: null, productId: { in: productIds } },
        select: { saleId: true, merchantId: true, productId: true, commissionAffiliate: true },
      });
      if (!sales.length) return applyApiSecurityHeaders(secureJson({ error: "No eligible sales." }, { status: 400 }), req);

      const totalAmount = sales.reduce((s, r) => s + Number(r.commissionAffiliate || 0), 0);
      if (!Number.isFinite(totalAmount) || totalAmount <= 0) return applyApiSecurityHeaders(secureJson({ error: "No eligible sales." }, { status: 400 }), req);
      if (totalAmount < minPayout) return applyApiSecurityHeaders(secureJson({ error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` }, { status: 400 }), req);

      const grouped = new Map();
      for (const s of sales) {
        const key = `${s.merchantId}-${s.productId}`;
        const g = grouped.get(key) ?? { amount: 0, saleIds: [], merchantId: s.merchantId, productId: s.productId };
        g.amount += Number(s.commissionAffiliate || 0);
        g.saleIds.push(s.saleId);
        grouped.set(key, g);
      }
      const payloadItems = Array.from(grouped.values());

      try {
        const requestId = await prisma.$transaction(async (tx) => {
          const payoutReq = await tx.payoutRequest.create({
            data: {
              userId,
              amountTotal: totalAmount,
              status: "pending",
              bankName,
              iban,
              realUserFullname: realName,
              platformPaid: false,
              idempotencyKey: idemKey,
              payoutRequestItems: {
                create: payloadItems.map((g) => ({
                  merchantId: g.merchantId,
                  productId: g.productId,
                  amount: g.amount,
                  sourceSaleIds: g.saleIds.join(","),
                })),
              },
            },
            include: { payoutRequestItems: true },
          });

          for (const item of payoutReq.payoutRequestItems) {
            const saleIds = String(item.sourceSaleIds || "")
              .split(",")
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n));
            if (!saleIds.length) continue;

            const upd = await tx.affiliateUserSale.updateMany({
              where: { saleId: { in: saleIds }, userId, status: "confirmed", payoutItemId: null },
              data: { payoutItemId: item.itemId },
            });
            if (upd.count !== saleIds.length) throw new Error("RACE_CONDITION");
          }

          await tx.payoutRequestLog.create({
            data: { requestId: payoutReq.requestId, userId, action: "create", newStatus: "pending", note: `Payout request created. Amount: ${totalAmount}` },
          });

          return payoutReq.requestId;
        });

        return applyApiSecurityHeaders(secureJson({ ok: true, message: "Payout request created", requestId }), req);
      } catch (err) {
        if (String(err?.message) === "RACE_CONDITION") {
          return applyApiSecurityHeaders(secureJson({ error: "Please retry. Some sales were already processed." }, { status: 409 }), req);
        }
        console.error("Payout create TX error:", err);
        return applyApiSecurityHeaders(secureJson({ error: "Server error" }, { status: 500 }), req);
      }
    }

    /* ---- (3) İptal ---- */
    if (raw.cancelRequest === true) {
      const parsed = payoutRequestIdSchema.extend({ cancelRequest: z.literal(true) }).safeParse(raw);
      if (!parsed.success) return applyApiSecurityHeaders(secureJson({ error: "Invalid requestId" }, { status: 400 }), req);
      const { requestId } = parsed.data;

      try {
        const result = await prisma.$transaction(async (tx) => {
          const reqItem = await tx.payoutRequest.findUnique({
            where: { requestId },
            include: { payoutRequestItems: true },
          });
          if (!reqItem || reqItem.userId !== userId || reqItem.status !== "pending") {
            return applyApiSecurityHeaders(secureJson({ error: "Request not found or not cancellable." }, { status: 400 }), req);
          }

          const now = Date.now();
          const lockAt = reqItem.requestedAt ? new Date(reqItem.requestedAt).getTime() + CANCELLATION_WINDOW_MS : 0;
          const progressed = reqItem.payoutRequestItems.some(
            (itm) => itm.status === "merchant_paid" || itm.status === "platform_confirmed"
          );
          if (progressed || now >= lockAt) {
            return applyApiSecurityHeaders(secureJson({ error: "This payout request is locked and cannot be cancelled." }, { status: 400 }), req);
          }

          for (const item of reqItem.payoutRequestItems) {
            const saleIds = String(item.sourceSaleIds || "")
              .split(",")
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n));
            if (saleIds.length) {
              await tx.affiliateUserSale.updateMany({ where: { saleId: { in: saleIds }, userId }, data: { payoutItemId: null } });
            }
          }

          await tx.payoutRequestItem.deleteMany({ where: { requestId } });
          await tx.payoutRequest.update({
            where: { requestId },
            data: { status: "rejected", rejectedReason: "User cancelled within lock window", updatedAt: new Date() },
          });
          await tx.payoutRequestLog.create({
            data: { requestId, userId, action: "cancel", oldStatus: "pending", newStatus: "rejected", note: "User cancelled payout request" },
          });

          return applyApiSecurityHeaders(secureJson({ ok: true, message: "Payout request cancelled" }), req);
        });

        return result;
      } catch (err) {
        console.error("Payout cancel TX error:", err);
        return applyApiSecurityHeaders(secureJson({ error: "Server error" }, { status: 500 }), req);
      }
    }

    /* ---- (4) Talep banka güncelle ---- */
    if (raw.updateRequestBank === true) {
      const parsed = payoutRequestIdSchema.extend({
        updateRequestBank: z.literal(true),
        iban: bankInfoSchema.shape.iban,
        bankName: bankInfoSchema.shape.bankName,
        realName: bankInfoSchema.shape.realName,
      }).safeParse({
        ...raw,
        iban: normalizeIban(raw.iban),
      });

      if (!parsed.success) {
        return applyApiSecurityHeaders(secureJson({ error: "Invalid bank info for update" }, { status: 400 }), req);
      }

      const { requestId, iban, bankName, realName } = parsed.data;

      const reqItem = await prisma.payoutRequest.findUnique({
        where: { requestId },
        include: { payoutRequestItems: { select: { status: true } } },
      });
      if (!reqItem || reqItem.userId !== userId || reqItem.status !== "pending") {
        return applyApiSecurityHeaders(secureJson({ error: "Not authorized" }, { status: 403 }), req);
      }

      const now = Date.now();
      const lockAt = reqItem.requestedAt ? new Date(reqItem.requestedAt).getTime() + CANCELLATION_WINDOW_MS : 0;
      const progressed = reqItem.payoutRequestItems.some(
        (itm) => itm.status === "merchant_paid" || itm.status === "platform_confirmed"
      );
      if (progressed || now >= lockAt) {
        return applyApiSecurityHeaders(secureJson({ error: "This payout request is locked and cannot be updated." }, { status: 400 }), req);
      }

      await prisma.payoutRequest.update({
        where: { requestId },
        data: { bankName, iban, realUserFullname: realName, updatedAt: new Date() },
      });

      await prisma.payoutRequestLog.create({
        data: { requestId, userId, action: "update_bank", oldStatus: "pending", newStatus: "pending", note: "User updated payout request bank snapshot" },
      });

      return applyApiSecurityHeaders(secureJson({ ok: true, message: "Payout request bank info updated" }), req);
    }

    return applyApiSecurityHeaders(secureJson({ error: "Invalid request" }, { status: 400 }), req);
  } catch (err) {
    console.error("Wallet API POST error:", err);
    return applyApiSecurityHeaders(secureJson({ error: "Server error" }, { status: 500 }), req);
  }
}
