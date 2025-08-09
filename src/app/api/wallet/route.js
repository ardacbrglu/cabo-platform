// src/app/api/wallet/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { z } from "zod";

/**
 * SECURITY NOTES
 * - Auth: NextAuth session (custom JWT/cookie yok).
 * - CSRF: POST için header (x-csrf-token | csrf-token) + cookie(csrf_token) eşleşmesi zorunlu.
 * - Rate limit: userId bazlı (GET: 30/dk, POST: 10/dk).
 * - Validation: Zod ile sıkı şema ve sanitize (trim/uppercase).
 * - Payout istekleri transaction içinde.
 */

function isValidIbanTR(iban) {
  return typeof iban === "string" && /^TR\d{24}$/.test(iban.toUpperCase().replace(/\s+/g, ""));
}

function cleanBankName(s) {
  return String(s || "").trim().slice(0, 120);
}

function cleanRealName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

const BankInfoSchema = z.object({
  iban: z.string().min(26).max(34),
  bankName: z.string().min(1).max(120),
  realName: z.string().min(1).max(120),
});

const PayoutCreateSchema = z.object({
  requestPayout: z.literal(true),
});

const PayoutCancelSchema = z.object({
  cancelRequest: z.literal(true),
  requestId: z.number().int().positive(),
});

const PostBodySchema = z.union([BankInfoSchema, PayoutCreateSchema, PayoutCancelSchema]);

async function getAuthedUserId(req) {
  const session = await getServerSession(authOptions);
  const rawId = session?.user?.id;
  const userId = Number(rawId);
  if (!rawId || !Number.isFinite(userId)) return null;

  // user scoped rate-limit key helper
  const rlKey = makeRateLimitKey(req, { scope: "wallet", userId });
  return { userId, rlKey };
}

async function getMinPayout() {
  const cfg = await prisma.platformConfig.findUnique({ where: { keyName: "min_payout" } });
  const v = cfg ? Number(cfg.value) : NaN;
  return Number.isFinite(v) ? v : 100; // varsayılan 100₺
}

export async function GET(req) {
  try {
    // Auth
    const info = await getAuthedUserId(req);
    if (!info) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { userId, rlKey } = info;

    // Rate limit (GET 30/dk)
    const rl = await checkRateLimit({ key: `${rlKey}:GET`, limit: 30, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
      );
    }

    const minPayout = await getMinPayout();

    // Kullanıcının sahip olduğu ürünler
    const links = await prisma.affiliateLink.findMany({
      where: { userId },
      select: { productId: true },
    });
    const productIds = links.map((l) => l.productId);

    // Mevcut bekleyen/approved payout var mı?
    const pendingRequest = await prisma.payoutRequest.findFirst({
      where: { userId, status: { in: ["pending", "approved"] } },
    });

    let pendingAmount = 0;
    if (pendingRequest) pendingAmount = Number(pendingRequest.amountTotal || 0);

    // confirmed & henüz payout'a bağlanmamış satışlar
    const confirmedSales = await prisma.affiliateUserSale.findMany({
      where: {
        userId,
        status: "confirmed",
        payoutItemId: null,
        productId: { in: productIds },
      },
    });
    const confirmed = confirmedSales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

    // pending & henüz payout'a bağlanmamış satışlar
    const pendingSales = await prisma.affiliateUserSale.findMany({
      where: {
        userId,
        status: "pending",
        payoutItemId: null,
        productId: { in: productIds },
      },
    });
    const pending = pendingSales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

    const balance = confirmed + pending;

    // Kullanıcı bank/ad bilgisi
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { iban: true, bankName: true, realUserFullname: true },
    });

    const iban = user?.iban || "";
    const bankName = user?.bankName || "";
    const realName = user?.realUserFullname || "";

    const ibanMissing = !isValidIbanTR(iban);
    const bankMissing = !cleanBankName(bankName);
    const realNameMissing = cleanRealName(realName).split(" ").length < 2;

    // payout history (kullanıcıya görünür kısım)
    const history = await prisma.payoutRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      {
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
        hasPendingRequest: !!pendingRequest,
        pendingAmount,
        history: history.map((item) => ({
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
        })),
      },
      { headers: { "Cache-Control": "no-store", "Vary": "Cookie" } }
    );
  } catch (err) {
    console.error("Wallet API GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    // CSRF (mutating)
    validateCsrfToken(req);

    // Auth
    const info = await getAuthedUserId(req);
    if (!info) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { userId, rlKey } = info;

    // Rate limit (POST 10/dk)
    const rl = await checkRateLimit({ key: `${rlKey}:POST`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
      );
    }

    // Body + Zod
    const raw = await req.json().catch(() => ({}));
    const parsed = PostBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const body = parsed.data;

    const minPayout = await getMinPayout();

    // ---- IBAN/Bank/Real Name güncelleme ----
    if ("iban" in body && "bankName" in body && "realName" in body) {
      const iban = body.iban.toUpperCase().replace(/\s+/g, "");
      const bankName = cleanBankName(body.bankName);
      const realName = cleanRealName(body.realName);

      if (!isValidIbanTR(iban)) {
        return NextResponse.json(
          { error: "Invalid IBAN. Only 26-character Turkish IBAN starting with TR is allowed." },
          { status: 400 }
        );
      }
      if (!bankName) {
        return NextResponse.json({ error: "Bank name is required." }, { status: 400 });
      }
      if (!realName || realName.split(" ").length < 2) {
        return NextResponse.json({ error: "Full legal name is required." }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          iban,
          bankName,
          realUserFullname: realName,
        },
      });

      return NextResponse.json({ ok: true, message: "Bank info saved" });
    }

    // ---- Payout request oluştur ----
    if ("requestPayout" in body && body.requestPayout === true) {
      // Aktif pending/approved var mı?
      const activeRequest = await prisma.payoutRequest.findFirst({
        where: { userId, status: { in: ["pending", "approved"] } },
      });
      if (activeRequest) {
        return NextResponse.json(
          { error: "You already have a pending payout request. Wait for it to be processed." },
          { status: 400 }
        );
      }

      // Snapshot için kullanıcı bilgisi
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { iban: true, bankName: true, realUserFullname: true },
      });
      const iban = user?.iban || "";
      const bankName = user?.bankName || "";
      const realName = user?.realUserFullname || "";

      if (!isValidIbanTR(iban)) {
        return NextResponse.json({ error: "Please save a valid IBAN first." }, { status: 400 });
      }
      if (!cleanBankName(bankName)) {
        return NextResponse.json({ error: "Please save your bank name first." }, { status: 400 });
      }
      if (cleanRealName(realName).split(" ").length < 2) {
        return NextResponse.json({ error: "Please save your full real name first." }, { status: 400 });
      }

      // Kullanıcının sahip olduğu ürünler
      const links = await prisma.affiliateLink.findMany({
        where: { userId },
        select: { productId: true },
      });
      const productIds = links.map((l) => l.productId);

      // Payout'a bağlanmamış confirmed satışlar
      const sales = await prisma.affiliateUserSale.findMany({
        where: {
          userId,
          status: "confirmed",
          payoutItemId: null,
          productId: { in: productIds },
        },
      });
      const amount = sales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

      if (amount < minPayout) {
        return NextResponse.json(
          { error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` },
          { status: 400 }
        );
      }

      return await prisma.$transaction(async (tx) => {
        const payoutReq = await tx.payoutRequest.create({
          data: {
            userId,
            amountTotal: amount,
            status: "pending",
            bankName,
            iban,
            realUserFullname: realName,
            platformPaid: false,
          },
        });

        for (const sale of sales) {
          const payoutItem = await tx.payoutRequestItem.create({
            data: {
              requestId: payoutReq.requestId,
              merchantId: sale.merchantId,
              productId: sale.productId,
              amount: sale.commissionAffiliate,
              sourceSaleIds: String(sale.saleId),
            },
          });

          await tx.affiliateUserSale.update({
            where: { saleId: sale.saleId },
            data: { payoutItemId: payoutItem.itemId },
          });
        }

        await tx.payoutRequestLog.create({
          data: {
            requestId: payoutReq.requestId,
            userId,
            action: "create",
            newStatus: "pending",
            note: `Payout request created. Amount: ${amount}`,
          },
        });

        return NextResponse.json({ ok: true, message: "Payout request created" });
      });
    }

    // ---- Payout request iptal ----
    if ("cancelRequest" in body && body.cancelRequest === true) {
      const reqId = Number(raw.requestId);
      if (!Number.isFinite(reqId) || reqId <= 0) {
        return NextResponse.json({ error: "Invalid requestId" }, { status: 400 });
      }

      return await prisma.$transaction(async (tx) => {
        const reqItem = await tx.payoutRequest.findUnique({ where: { requestId: reqId } });
        if (!reqItem || reqItem.userId !== userId || reqItem.status !== "pending") {
          return NextResponse.json({ error: "Request not found or not cancellable." }, { status: 400 });
        }

        const items = await tx.payoutRequestItem.findMany({ where: { requestId: reqId } });

        // 10 dk kuralı
        const now = new Date();
        const createdAt = new Date(reqItem.requestedAt);
        if (now.getTime() - createdAt.getTime() > 10 * 60 * 1000) {
          return NextResponse.json(
            { error: "You can only cancel a payout request within 10 minutes after creation." },
            { status: 400 }
          );
        }

        // Durumu ilerlemiş item varsa iptal etme
        if (items.some((itm) => itm.status === "merchant_paid" || itm.status === "platform_confirmed")) {
          return NextResponse.json(
            {
              error:
                "This payout request can no longer be cancelled because the merchant has already marked it as paid. Please contact support if there is a problem.",
            },
            { status: 400 }
          );
        }

        // Satışları geri bağla
        for (const item of items) {
          if (item.sourceSaleIds) {
            const saleIds = item.sourceSaleIds
              .split(",")
              .map((id) => Number(id))
              .filter((n) => Number.isFinite(n));
            if (saleIds.length) {
              await tx.affiliateUserSale.updateMany({
                where: { saleId: { in: saleIds }, userId },
                data: { payoutItemId: null },
              });
            }
          }
        }

        await tx.payoutRequestItem.deleteMany({ where: { requestId: reqId } });
        await tx.payoutRequest.update({
          where: { requestId: reqId },
          data: {
            status: "rejected",
            rejectedReason: "User cancelled request",
            updatedAt: new Date(),
          },
        });
        await tx.payoutRequestLog.create({
          data: {
            requestId: reqId,
            userId,
            action: "cancel",
            oldStatus: "pending",
            newStatus: "rejected",
            note: "User cancelled payout request",
          },
        });

        return NextResponse.json({ ok: true, message: "Payout request cancelled" });
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    console.error("Wallet API POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
