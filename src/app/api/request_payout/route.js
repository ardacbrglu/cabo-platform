// export async function POST(req) {
//   try {
//     const token = getTokenFromRequest(req);
//     const payload = token ? verifyToken(token) : null;
//     if (!payload?.user_id) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }
//     const userId = payload.user_id;
//     const body = await req.json();

//     // ... (IBAN / banka adı / ad-soyad validasyonu KALSIN)

//     // payout request başlat (body.requestPayout ile tetikleniyor)
//     if (body.requestPayout) {
//       // ... (önce aktif request kontrolü ve user snapshot'ı KALSIN)

//       // payout_item_id'si null olan confirmed satışlar kullanılabilir!
//       const links = await prisma.affiliateLink.findMany({
//         where: { user_id: userId },
//         select: { product_id: true }
//       });
//       const productIds = links.map(l => l.product_id);

//       const sales = await prisma.affiliate_user_sales.findMany({
//         where: {
//           user_id: userId,
//           status: "confirmed",
//           payout_item_id: null,
//           product_id: { in: productIds }
//         }
//       });
//       const amount = sales.reduce((sum, s) => sum + Number(s.commission_affiliate), 0);

//       if (amount < minPayout) {
//         return NextResponse.json({ error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` }, { status: 400 });
//       }

//       // ***** DÜZELTME: merchant_id + product_id kombinasyonuna göre ayır!
//       const itemsToCreate = [];
//       for (const sale of sales) {
//         const key = `${sale.merchant_id}-${sale.product_id}`;
//         let item = itemsToCreate.find(it => it.key === key);
//         if (!item) {
//           item = {
//             key,
//             merchant_id: sale.merchant_id,
//             product_id: sale.product_id,
//             amount: 0,
//             sale_ids: []
//           };
//           itemsToCreate.push(item);
//         }
//         item.amount += Number(sale.commission_affiliate);
//         item.sale_ids.push(sale.sale_id);
//       }
//       const payoutItemsCreate = itemsToCreate.map(it => ({
//         merchant_id: it.merchant_id,
//         product_id: it.product_id,
//         amount: it.amount,
//         source_sale_ids: it.sale_ids.join(',')
//       }));

//       return await prisma.$transaction(async (tx) => {
//         // payoutRequest kaydı
//         const payoutReq = await tx.payoutRequest.create({
//           data: {
//             user_id: userId,
//             amount_total: amount,
//             status: "pending",
//             bank_name: user.bankName,
//             iban: user.iban,
//             real_user_fullname: user.real_user_fullname,
//             platform_paid: false,
//             payout_request_items: { create: payoutItemsCreate }
//           },
//           include: { payout_request_items: true }
//         });

//         // Her satışa ilgili payout_item_id'yi yaz (toplu update)
//         for (const item of payoutReq.payout_request_items) {
//           const saleIds = item.source_sale_ids.split(',').map(Number);
//           await tx.affiliate_user_sales.updateMany({
//             where: { sale_id: { in: saleIds } },
//             data: { payout_item_id: item.item_id }
//           });
//         }

//         // Log
//         await tx.payout_request_logs.create({
//           data: {
//             request_id: payoutReq.request_id,
//             user_id: userId,
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
    if (!payload?.user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.user_id;
    const body = await req.json();

    // ... (IBAN / banka adı / ad-soyad validasyonu KALSIN)

    // payout request başlat (body.requestPayout ile tetikleniyor)
    if (body.requestPayout) {
      // ... (önce aktif request kontrolü ve user snapshot'ı KALSIN)

      // payout_item_id'si null olan confirmed satışlar kullanılabilir!
      const links = await prisma.affiliateLink.findMany({
        where: { user_id: userId },
        select: { product_id: true }
      });
      const productIds = links.map(l => l.product_id);

      const sales = await prisma.affiliate_user_sales.findMany({
        where: {
          user_id: userId,
          status: "confirmed",
          payout_item_id: null,
          product_id: { in: productIds }
        }
      });
      const amount = sales.reduce((sum, s) => sum + Number(s.commission_affiliate), 0);

      if (amount < minPayout) {
        return NextResponse.json({ error: `Minimum payout is ${minPayout}₺. You do not have enough balance.` }, { status: 400 });
      }

      // ***** DÜZELTME: merchant_id + product_id kombinasyonuna göre ayır!
      const itemsToCreate = [];
      for (const sale of sales) {
        const key = `${sale.merchant_id}-${sale.product_id}`;
        let item = itemsToCreate.find(it => it.key === key);
        if (!item) {
          item = {
            key,
            merchant_id: sale.merchant_id,
            product_id: sale.product_id,
            amount: 0,
            sale_ids: []
          };
          itemsToCreate.push(item);
        }
        item.amount += Number(sale.commission_affiliate);
        item.sale_ids.push(sale.sale_id);
      }
      const payoutItemsCreate = itemsToCreate.map(it => ({
        merchant_id: it.merchant_id,
        product_id: it.product_id,
        amount: it.amount,
        source_sale_ids: it.sale_ids.join(',')
      }));

      return await prisma.$transaction(async (tx) => {
        // payoutRequest kaydı
        const payoutReq = await tx.payoutRequest.create({
          data: {
            user_id: userId,
            amount_total: amount,
            status: "pending",
            bank_name: user.bankName,
            iban: user.iban,
            real_user_fullname: user.real_user_fullname,
            platform_paid: false,
            payout_request_items: { create: payoutItemsCreate }
          },
          include: { payout_request_items: true }
        });

        // Her satışa ilgili payout_item_id'yi yaz (toplu update)
        for (const item of payoutReq.payout_request_items) {
          const saleIds = item.source_sale_ids.split(',').map(Number);
          await tx.affiliate_user_sales.updateMany({
            where: { sale_id: { in: saleIds } },
            data: { payout_item_id: item.item_id }
          });
        }

        // Log
        await tx.payout_request_logs.create({
          data: {
            request_id: payoutReq.request_id,
            user_id: userId,
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
