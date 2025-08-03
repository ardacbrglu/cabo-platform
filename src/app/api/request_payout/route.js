// export async function POST(req) {
//   try {
//     const token = getTokenFromRequest(req);
//     const payload = token ? verifyToken(token) : null;
//     if (!payload?.userId) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }
//     const userId = payload.userId;
//     const body = await req.json();

//     // ... (IBAN / banka adı / ad-soyad validasyonu KALSIN)

//     // payout request başlat (body.requestPayout ile tetikleniyor)
//     if (body.requestPayout) {
//       // ... (önce aktif request kontrolü ve user snapshot'ı KALSIN)

//       // payout_itemId'si null olan confirmed satışlar kullanılabilir!
//       const links = await prisma.affiliateLink.findMany({
//         where: { userId: userId },
//         select: { productId: true }
//       });
//       const productIds = links.map(l => l.productId);

//       const sales = await prisma.affiliate_user_sales.findMany({
//         where: {
//           userId: userId,
//           status: "confirmed",
//           payout_itemId: null,
//           productId: { in: productIds }
//         }
//       });
//       const amount = sales.reduce((sum, s) => sum + Number(s.commissionAffiliate), 0);

//       if (amount < minPayout) {
//         return NextResponse.json({ error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` }, { status: 400 });
//       }

//       // ***** DÜZELTME: merchantId + productId kombinasyonuna göre ayır!
//       const itemsToCreate = [];
//       for (const sale of sales) {
//         const key = `${sale.merchantId}-${sale.productId}`;
//         let item = itemsToCreate.find(it => it.key === key);
//         if (!item) {
//           item = {
//             key,
//             merchantId: sale.merchantId,
//             productId: sale.productId,
//             amount: 0,
//             saleIds: []
//           };
//           itemsToCreate.push(item);
//         }
//         item.amount += Number(sale.commissionAffiliate);
//         item.saleIds.push(sale.saleId);
//       }
//       const payoutItemsCreate = itemsToCreate.map(it => ({
//         merchantId: it.merchantId,
//         productId: it.productId,
//         amount: it.amount,
//         source_saleIds: it.saleIds.join(',')
//       }));

//       return await prisma.$transaction(async (tx) => {
//         // payoutRequest kaydı
//         const payoutReq = await tx.payoutRequest.create({
//           data: {
//             userId: userId,
//             amount_total: amount,
//             status: "pending",
//             bankName: user.bankName,
//             iban: user.iban,
//             realUserFullname: user.realUserFullname,
//             platform_paid: false,
//             payoutRequestItems: { create: payoutItemsCreate }
//           },
//           include: { payoutRequestItems: true }
//         });

//         // Her satışa ilgili payout_itemId'yi yaz (toplu update)
//         for (const item of payoutReq.payoutRequestItems) {
//           const saleIds = item.source_saleIds.split(',').map(Number);
//           await tx.affiliate_user_sales.updateMany({
//             where: { saleId: { in: saleIds } },
//             data: { payout_itemId: item.itemId }
//           });
//         }

//         // Log
//         await tx.payout_request_logs.create({
//           data: {
//             requestId: payoutReq.requestId,
//             userId: userId,
//             action: "create",
//             new_status: "pending",
//             note: `Payout request created. Amount: ${amount}`
//           }
//         });

//         return NextResponse.json({ ok: true, message: "Payout request created" });
//       });
//     }

//     // ... (cancelRequest ve diğer post handlerları aynen KALSIN)

//     return NextResponse.json({ error: "Invalid request" }, { status: 400 });
//   } catch (err) {
//     console.error("Wallet API POST error:", err);
//     return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
//   }
// }







export async function POST(req) {
  try {
    const token = getTokenFromRequest(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.userId;
    const body = await req.json();

    // ... (IBAN / banka adı / ad-soyad validasyonu KALSIN)

    // payout request başlat (body.requestPayout ile tetikleniyor)
    if (body.requestPayout) {
      // ... (önce aktif request kontrolü ve user snapshot'ı KALSIN)

      // payout_itemId'si null olan confirmed satışlar kullanılabilir!
      const links = await prisma.affiliateLink.findMany({
        where: { userId: userId },
        select: { productId: true }
      });
      const productIds = links.map(l => l.productId);

      const sales = await prisma.affiliate_user_sales.findMany({
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

      // ***** DÜZELTME: merchantId + productId kombinasyonuna göre ayır!
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
        source_saleIds: it.saleIds.join(',')
      }));

      return await prisma.$transaction(async (tx) => {
        // payoutRequest kaydı
        const payoutReq = await tx.payoutRequest.create({
          data: {
            userId: userId,
            amount_total: amount,
            status: "pending",
            bankName: user.bankName,
            iban: user.iban,
            realUserFullname: user.realUserFullname,
            platform_paid: false,
            payoutRequestItems: { create: payoutItemsCreate }
          },
          include: { payoutRequestItems: true }
        });

        // Her satışa ilgili payout_itemId'yi yaz (toplu update)
        for (const item of payoutReq.payoutRequestItems) {
          const saleIds = item.source_saleIds.split(',').map(Number);
          await tx.affiliate_user_sales.updateMany({
            where: { saleId: { in: saleIds } },
            data: { payout_itemId: item.itemId }
          });
        }

        // Log
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

    // ... (cancelRequest ve diğer post handlerları aynen KALSIN)

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    console.error("Wallet API POST error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
