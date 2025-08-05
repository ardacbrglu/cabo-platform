//src\app\api\wallet
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/authOptions";
import { checkRateLimit } from "@/lib/ratelimit";
import { validatecsrf_token } from "@/lib/csrf";

// SECURITY REVIEW: This route uses validatecsrf_token for CSRF protection. Ensure the CSRF secret is strong and not default. Consider per-session/user tokens for higher security.
// SECURITY REVIEW: This API handles wallet and payout logic. See comments below for security notes.

function isValidIbanTR(iban) {
  return typeof iban === "string" && iban.startsWith("TR") && iban.length === 26;
}

async function getUserIdSafe(req) {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload?.userId) return null;
  // WARNING: Always validate and sanitize userId from token. Never trust user input for sensitive queries.
  await checkRateLimit(req, payload.userId, 40, "5m", "wallet-api");
  // NOTE: Rate limiting is per user. Consider additional device/IP-based limits for abuse prevention.
  return payload.userId;
}

export async function GET(req) {
  // WARNING: Ensure only authenticated users can access wallet data. Never expose sensitive info to unauthorized users.
  try {
    const userId = await getUserIdSafe(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Minimum payout (platformConfig)
    const config = await prisma.platformConfig.findUnique({ where: { keyName: "min_payout" } });
    const minPayout = config ? Number(config.value) : 100;
    // NOTE: Only expose non-sensitive config to users.

    const links = await prisma.affiliateLink.findMany({
      where: { userId: userId },
      select: { productId: true }
    });
    const productIds = links.map(l => l.productId);

    // pending veya approved payout request var mı?
    const pendingRequest = await prisma.payoutRequest.findFirst({
      where: { userId: userId, status: { in: ["pending", "approved"] } }
    });

    let pendingAmount = 0;
    if (pendingRequest) pendingAmount = Number(pendingRequest.amountTotal || 0);

    // payout'a bağlı olmayan (henüz çekilmemiş) confirmed satışlar
    const confirmedSales = await prisma.affiliateUserSale.findMany({
      where: {
        userId: userId,
        status: "confirmed",
        payoutItemId: null,
        productId: { in: productIds }
      }
    });
    const confirmed = confirmedSales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

    // payout'a bağlı olmayan pending satışlar
    const pendingSales = await prisma.affiliateUserSale.findMany({
      where: {
        userId: userId,
        status: "pending",
        payoutItemId: null,
        productId: { in: productIds }
      }
    });
    const pending = pendingSales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

    const balance = confirmed + pending;

    // Kullanıcı banka/ad bilgisi
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { iban: true, bankName: true, realUserFullname: true }
    });
    // WARNING: Only select fields that are safe to expose. Never return sensitive data (passwords, tokens, etc).
    const iban = user?.iban || "";
    const bankName = user?.bankName || "";
    const realName = user?.realUserFullname || "";

    const ibanMissing = !iban || iban.length !== 26 || !iban.startsWith("TR");
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(" ").length < 2;

    // payout history
    const history = await prisma.payoutRequest.findMany({
      where: { userId: userId },
      orderBy: { requestedAt: "desc" },
      take: 100
    });

    return NextResponse.json({
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
      history: history.map(item => ({
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
      }))
    });
    // NOTE: Only expose non-sensitive payout history. Never include internal notes or admin-only data.
  } catch (err) {
    console.error("Wallet API GET error:", err);
    // WARNING: Avoid logging sensitive user data in production logs. Consider alerting admins for repeated failures.
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req) {
  // WARNING: Ensure only authenticated users can modify wallet data. Validate all input fields strictly.
  try {
    const userId = await getUserIdSafe(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await validatecsrf_token(req);
    // SECURITY REVIEW: CSRF protection is enabled for this sensitive endpoint. Keep this for all state-changing wallet operations.
    // NOTE: CSRF protection is enabled. Always keep this active for sensitive endpoints.

    const body = await req.json();
    // WARNING: No input sanitization beyond basic checks. Consider using a library to sanitize all user input to prevent injection attacks.

    const config = await prisma.platformConfig.findUnique({ where: { keyName: "min_payout" } });
    const minPayout = config ? Number(config.value) : 100;

    // IBAN/banka/ad güncelleme
    if (body.iban && body.bankName && body.realName) {
      // WARNING: IBAN, bank name, and real name are user-controlled. Validate and sanitize before saving to DB.
      if (!isValidIbanTR(body.iban)) {
        return NextResponse.json({ error: "Invalid IBAN. Only 26-character Turkish IBAN starting with TR is allowed." }, { status: 400 });
      }
      if (!body.bankName.trim()) {
        return NextResponse.json({ error: "Bank name is required." }, { status: 400 });
      }
      if (!body.realName.trim() || body.realName.trim().split(' ').length < 2) {
        return NextResponse.json({ error: "Full legal name is required." }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: userId },
        data: {
          iban: body.iban,
          bankName: body.bankName,
          realUserFullname: body.realName
        }
      });
      // NOTE: Consider logging changes to sensitive user data for audit purposes.
      return NextResponse.json({ ok: true, message: "Bank info saved" });
    }

    if ((body.iban && !body.realName) || (body.bankName && !body.realName)) {
      // NOTE: Always require full legal name for financial operations.
      return NextResponse.json({ error: "Full legal name is required." }, { status: 400 });
    }

    // Payout request başlat
    if (body.requestPayout) {
      // WARNING: Payout requests are sensitive. Ensure all business rules are enforced and log actions for auditing.
      const activeRequest = await prisma.payoutRequest.findFirst({
        where: { userId: userId, status: { in: ["pending", "approved"] } }
      });
      if (activeRequest) {
        return NextResponse.json({ error: "You already have a pending payout request. Wait for it to be processed." }, { status: 400 });
      }

      // Kullanıcı banka & ad snapshot'ı
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { iban: true, bankName: true, realUserFullname: true }
      });
      // WARNING: Always use a snapshot of user bank info at the time of payout request. Never trust client-side data for payouts.
      if (!user?.iban || !isValidIbanTR(user.iban)) {
        return NextResponse.json({ error: "Please save a valid IBAN first." }, { status: 400 });
      }
      if (!user?.bankName || !user.bankName.trim()) {
        return NextResponse.json({ error: "Please save your bank name first." }, { status: 400 });
      }
      if (!user?.realUserFullname || user.realUserFullname.trim().split(' ').length < 2) {
        return NextResponse.json({ error: "Please save your full real name first." }, { status: 400 });
      }

      const links = await prisma.affiliateLink.findMany({
        where: { userId: userId },
        select: { productId: true }
      });
      const productIds = links.map(l => l.productId);

      const sales = await prisma.affiliateUserSale.findMany({
        where: {
          userId: userId,
          status: "confirmed",
          payoutItemId: null,
          productId: { in: productIds }
        }
      });
      const amount = sales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

      if (amount < minPayout) {
        return NextResponse.json({ error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` }, { status: 400 });
      }

      return await prisma.$transaction(async (tx) => {
        // NOTE: All payout operations are wrapped in a DB transaction. Good practice for consistency.
        const payoutReq = await tx.payoutRequest.create({
          data: {
            userId: userId,
            amountTotal: amount,
            status: "pending",
            bankName: user.bankName,
            iban: user.iban,
            realUserFullname: user.realUserFullname,
            platformPaid: false
          }
        });

        for (const sale of sales) {
          const payoutItem = await tx.payoutRequestItem.create({
            data: {
              requestId: payoutReq.requestId,
              merchantId: sale.merchantId,
              productId: sale.productId,
              amount: sale.commissionAffiliate,
              sourceSaleIds: sale.saleId.toString(),
            }
          });
          await tx.affiliateUserSale.update({
            where: { saleId: sale.saleId },
            data: { payoutItemId: payoutItem.itemId }
          });
        }

        await tx.payoutRequestLog.create({
          data: {
            requestId: payoutReq.requestId,
            userId: userId,
            action: "create",
            newStatus: "pending",
            note: `Payout request created. Amount: ${amount}`
          }
        });

        return NextResponse.json({ ok: true, message: "Payout request created" });
      });
    }

    // CANCEL REQUEST
    if (body.cancelRequest && body.requestId) {
      // WARNING: Only allow users to cancel their own pending payout requests. Validate request ownership and status.
      return await prisma.$transaction(async (tx) => {
        // NOTE: All cancel operations are wrapped in a DB transaction. Good practice for consistency.
        const reqItem = await tx.payoutRequest.findUnique({
          where: { requestId: body.requestId }
        });
        if (!reqItem || reqItem.userId !== userId || reqItem.status !== "pending") {
          return NextResponse.json({ error: "Request not found or not cancellable." }, { status: 400 });
        }
        const items = await tx.payoutRequestItem.findMany({
          where: { requestId: body.requestId }
        });

        const now = new Date();
        const createdAt = new Date(reqItem.requestedAt);
        if ((now - createdAt) > 10 * 60 * 1000) {
          return NextResponse.json({
            error: "You can only cancel a payout request within 10 minutes after creation."
          }, { status: 400 });
        }

        if (items.some(itm => itm.status === "merchant_paid" || itm.status === "platform_confirmed")) {
          return NextResponse.json({
            error: "This payout request can no longer be cancelled because the merchant has already marked it as paid. Please contact support if there is a problem."
          }, { status: 400 });
        }

        for (const item of items) {
          if (item.sourceSaleIds) {
            const saleIds = item.sourceSaleIds.split(',').map(id => Number(id)).filter(Boolean);
            await tx.affiliateUserSale.updateMany({
              where: { saleId: { in: saleIds }, userId: userId },
              data: { payoutItemId: null }
            });
          }
        }
        await tx.payoutRequestItem.deleteMany({
          where: { requestId: body.requestId }
        });
        await tx.payoutRequest.update({
          where: { requestId: body.requestId },
          data: {
            status: "rejected",
            rejectedReason: "User cancelled request",
            updatedAt: new Date()
          }
        });
        await tx.payoutRequestLog.create({
          data: {
            requestId: body.requestId,
            userId: userId,
            action: "cancel",
            oldStatus: "pending",
            newStatus: "rejected",
            note: "User cancelled payout request"
          }
        });
        return NextResponse.json({ ok: true, message: "Payout request cancelled" });
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    console.error("Wallet API POST error:", err);
    // WARNING: Avoid logging sensitive user data in production logs. Consider alerting admins for repeated failures.
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
