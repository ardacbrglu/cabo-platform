import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { validateCsrfToken } from "@/lib/csrf";

// Yalnızca Türkiye için örnek IBAN doğrulama
function isValidIbanTR(iban) {
  return typeof iban === "string" && iban.startsWith("TR") && iban.length === 26;
}

async function getUserIdSafe(req) {
  // JWT doğrulama
  const token = getTokenFromRequest(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload?.userId) return null;
  // Rate limit - hem IP, hem user bazlı (gerekirse artır!)
  await checkRateLimit(req, payload.userId, 40, "5m", "wallet-api");
  return payload.userId;
}

export async function GET(req) {
  try {
    // Rate limit + Auth
    const userId = await getUserIdSafe(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Minimum payout
    const config = await prisma.platform_config.findUnique({ where: { key_name: "min_payout" } });
    const minPayout = config ? Number(config.value) : 100;

    // Kullanıcının sahip olduğu productId’ler
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
        payout_itemId: null,
        productId: { in: productIds }
      }
    });
    const confirmed = confirmedSales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

    // payout'a bağlı olmayan pending satışlar
    const pendingSales = await prisma.affiliateUserSale.findMany({
      where: {
        userId: userId,
        status: "pending",
        payout_itemId: null,
        productId: { in: productIds }
      }
    });
    const pending = pendingSales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

    const balance = confirmed + pending;

    // Kullanıcı banka/ad bilgisi
    const user = await prisma.user.findUnique({
      where: { userId: userId },
      select: { iban: true, bankName: true, realUserFullname: true }
    });
    const iban = user?.iban || "";
    const bankName = user?.bankName || "";
    const realName = user?.realUserFullname || "";

    const ibanMissing = !iban || iban.length !== 26 || !iban.startsWith("TR");
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(" ").length < 2;

    // payout history
    const history = await prisma.payoutRequest.findMany({
      where: { userId: userId },
      orderBy: { requested_at: "desc" },
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
        date: item.requested_at?.toISOString().slice(0, 10) || "",
        amount: Number(item.amountTotal),
        status: item.status,
        method: "IBAN",
        bankName: item.bankName || "",
        iban: item.iban || "",
        realName: item.realUserFullname || "",
        platform_paid: !!item.platform_paid,
        platformPaidAt: item.platformPaidAt,
        paid_at: item.paid_at,
        rejectedReason: item.rejectedReason,
        updatedAt: item.updatedAt,
      }))
    });
  } catch (err) {
    console.error("Wallet API GET error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    // Auth + Rate limit
    const userId = await getUserIdSafe(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // CSRF kontrolü (custom bir header veya body'den alınabilir)
    await validateCsrfToken(req);

    const body = await req.json();

    // Minimum payout'u çek
    const config = await prisma.platform_config.findUnique({ where: { key_name: "min_payout" } });
    const minPayout = config ? Number(config.value) : 100;

    // IBAN/banka/ad güncelleme
    if (body.iban && body.bankName && body.realName) {
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
        where: { userId: userId },
        data: {
          iban: body.iban,
          bankName: body.bankName,
          realUserFullname: body.realName
        }
      });
      return NextResponse.json({ ok: true, message: "Bank info saved" });
    }

    if ((body.iban && !body.realName) || (body.bankName && !body.realName)) {
      return NextResponse.json({ error: "Full legal name is required." }, { status: 400 });
    }

    // Payout request başlat
    if (body.requestPayout) {
      const activeRequest = await prisma.payoutRequest.findFirst({
        where: { userId: userId, status: { in: ["pending", "approved"] } }
      });
      if (activeRequest) {
        return NextResponse.json({ error: "You already have a pending payout request. Wait for it to be processed." }, { status: 400 });
      }

      // Kullanıcı banka & ad snapshot'ı
      const user = await prisma.user.findUnique({
        where: { userId: userId },
        select: { iban: true, bankName: true, realUserFullname: true }
      });
      if (!user?.iban || !isValidIbanTR(user.iban)) {
        return NextResponse.json({ error: "Please save a valid IBAN first." }, { status: 400 });
      }
      if (!user?.bankName || !user.bankName.trim()) {
        return NextResponse.json({ error: "Please save your bank name first." }, { status: 400 });
      }
      if (!user?.realUserFullname || user.realUserFullname.trim().split(' ').length < 2) {
        return NextResponse.json({ error: "Please save your full real name first." }, { status: 400 });
      }

      // payout_itemId'si null olan confirmed satışlar
      const links = await prisma.affiliateLink.findMany({
        where: { userId: userId },
        select: { productId: true }
      });
      const productIds = links.map(l => l.productId);

      const sales = await prisma.affiliateUserSale.findMany({
        where: {
          userId: userId,
          status: "confirmed",
          payout_itemId: null,
          productId: { in: productIds }
        }
      });
      const amount = sales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

      if (amount < minPayout) {
        return NextResponse.json({ error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` }, { status: 400 });
      }

      return await prisma.$transaction(async (tx) => {
        const payoutReq = await tx.payoutRequest.create({
          data: {
            userId: userId,
            amountTotal: amount,
            status: "pending",
            bankName: user.bankName,
            iban: user.iban,
            realUserFullname: user.realUserFullname,
            platform_paid: false
          }
        });

        for (const sale of sales) {
          const payoutItem = await tx.payoutRequestItems.create({
            data: {
              requestId: payoutReq.requestId,
              merchantId: sale.merchantId,
              productId: sale.productId,
              amount: sale.commissionAffiliate,
              source_saleIds: sale.saleId.toString(),
            }
          });
          await tx.affiliateUserSale.update({
            where: { saleId: sale.saleId },
            data: { payout_itemId: payoutItem.itemId }
          });
        }

        await tx.payout_request_logs.create({
          data: {
            requestId: payoutReq.requestId,
            userId: userId,
            action: "create",
            new_status: "pending",
            note: `Payout request created. Amount: ${amount}`
          }
        });

        return NextResponse.json({ ok: true, message: "Payout request created" });
      });
    }

    // *** KORUMALI CANCEL: sadece Tüm payoutRequestItems'lar status==pending ise iptal edebilir ***
    if (body.cancelRequest && body.requestId) {
      return await prisma.$transaction(async (tx) => {
        const reqItem = await tx.payoutRequest.findUnique({
          where: { requestId: body.requestId }
        });
        if (!reqItem || reqItem.userId !== userId || reqItem.status !== "pending") {
          return NextResponse.json({ error: "Request not found or not cancellable." }, { status: 400 });
        }
        // Bağlı payoutRequestItems
        const items = await tx.payoutRequestItems.findMany({
          where: { requestId: body.requestId }
        });

        // Süre kontrolü (10 dakika = 600_000 ms)
        const now = new Date();
        const createdAt = new Date(reqItem.requested_at);
        if ((now - createdAt) > 10 * 60 * 1000) {
          return NextResponse.json({
            error: "You can only cancel a payout request within 10 minutes after creation."
          }, { status: 400 });
        }

        // Eğer herhangi bir payoutRequestItems'ın status'ü "merchant_paid" veya "platform_confirmed" ise: İPTAL YASAK!
        if (items.some(itm => itm.status === "merchant_paid" || itm.status === "platform_confirmed")) {
          return NextResponse.json({ 
            error: "This payout request can no longer be cancelled because the merchant has already marked it as paid. Please contact support if there is a problem." 
          }, { status: 400 });
        }

        // Bağlı satışların payout_itemId'sini null yap
        for (const item of items) {
          if (item.source_saleIds) {
            const saleIds = item.source_saleIds.split(',').map(id => Number(id)).filter(Boolean);
            await tx.affiliateUserSale.updateMany({
              where: { saleId: { in: saleIds }, userId: userId },
              data: { payout_itemId: null }
            });
          }
        }
        await tx.payoutRequestItems.deleteMany({
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
        await tx.payout_request_logs.create({
          data: {
            requestId: body.requestId,
            userId: userId,
            action: "cancel",
            old_status: "pending",
            new_status: "rejected",
            note: "User cancelled payout request"
          }
        });
        return NextResponse.json({ ok: true, message: "Payout request cancelled" });
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    console.error("Wallet API POST error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
