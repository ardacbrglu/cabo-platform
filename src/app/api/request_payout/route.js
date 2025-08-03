export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

// minPayout değeri örnek olarak alınıyor, bunu environment/config'den çekebilirsin.
const minPayout = 100; // Örneğin 100₺

export async function POST(req) {
  try {
    const token = getTokenFromRequest(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.userId;
    const body = await req.json();

    // Kullanıcı snapshotını çek
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        bankName: true,
        iban: true,
        realUserFullname: true
      }
    });

    // payout request başlat (body.requestPayout ile tetikleniyor)
    if (body.requestPayout) {
      // payout_itemId'si null olan confirmed satışlar kullanılabilir!
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

      // merchantId + productId kombinasyonuna göre ayır!
      const itemsToCreate = [];
      for (const sale of sales) {
        const key = `${sale.merchantId}-${sale.productId}`;
        let item = itemsToCreate.find(it => it.key === key);
        if (!item) {
          item = {
            key,
            merchantId: sale.merchantId,
            productId: sale.productId,
            amount: 0,
            saleIds: []
          };
          itemsToCreate.push(item);
        }
        item.amount += Number(sale.commissionAffiliate);
        item.saleIds.push(sale.saleId);
      }
      const payoutItemsCreate = itemsToCreate.map(it => ({
        merchantId: it.merchantId,
        productId: it.productId,
        amount: it.amount,
        sourceSaleIds: it.saleIds.join(',')
      }));

      return await prisma.$transaction(async (tx) => {
        // payoutRequest kaydı
        const payoutReq = await tx.payoutRequest.create({
          data: {
            userId: userId,
            amountTotal: amount,
            status: "pending",
            bankName: user.bankName,
            iban: user.iban,
            realUserFullname: user.realUserFullname,
            platformPaid: false,
            payoutRequestItems: { create: payoutItemsCreate }
          },
          include: { payoutRequestItems: true }
        });

        // Her satışa ilgili payoutItemId'yi yaz (toplu update)
        for (const item of payoutReq.payoutRequestItems) {
          const saleIds = item.sourceSaleIds.split(',').map(Number);
          await tx.affiliateUserSale.updateMany({
            where: { saleId: { in: saleIds } },
            data: { payoutItemId: item.itemId }
          });
        }

        // Log
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

    // ... (cancelRequest ve diğer post handlerları aynen KALSIN)

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    console.error("Wallet API POST error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
