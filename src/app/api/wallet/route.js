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
  if (!payload?.user_id) return null;
  // Rate limit - hem IP, hem user bazlı (gerekirse artır!)
  await checkRateLimit(req, payload.user_id, 40, "5m", "wallet-api");
  return payload.user_id;
}

export async function GET(req) {
  try {
    // Rate limit + Auth
    const userId = await getUserIdSafe(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Minimum payout
    const config = await prisma.platform_config.findUnique({ where: { key_name: "min_payout" } });
    const minPayout = config ? Number(config.value) : 100;

    // Kullanıcının sahip olduğu product_id’ler
    const links = await prisma.affiliateLink.findMany({
      where: { user_id: userId },
      select: { product_id: true }
    });
    const productIds = links.map(l => l.product_id);

    // pending veya approved payout request var mı?
    const pendingRequest = await prisma.payoutRequest.findFirst({
      where: { user_id: userId, status: { in: ["pending", "approved"] } }
    });

    let pendingAmount = 0;
    if (pendingRequest) pendingAmount = Number(pendingRequest.amount_total || 0);

    // payout'a bağlı olmayan (henüz çekilmemiş) confirmed satışlar
    const confirmedSales = await prisma.affiliateUserSale.findMany({
      where: {
        user_id: userId,
        status: "confirmed",
        payout_item_id: null,
        product_id: { in: productIds }
      }
    });
    const confirmed = confirmedSales.reduce((sum, s) => sum + Number(s.commission_affiliate), 0);

    // payout'a bağlı olmayan pending satışlar
    const pendingSales = await prisma.affiliateUserSale.findMany({
      where: {
        user_id: userId,
        status: "pending",
        payout_item_id: null,
        product_id: { in: productIds }
      }
    });
    const pending = pendingSales.reduce((sum, s) => sum + Number(s.commission_affiliate), 0);

    const balance = confirmed + pending;

    // Kullanıcı banka/ad bilgisi
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { iban: true, bankName: true, real_user_fullname: true }
    });
    const iban = user?.iban || "";
    const bankName = user?.bankName || "";
    const realName = user?.real_user_fullname || "";

    const ibanMissing = !iban || iban.length !== 26 || !iban.startsWith("TR");
    const bankMissing = !bankName || !bankName.trim();
    const realNameMissing = !realName || realName.trim().split(" ").length < 2;

    // payout history
    const history = await prisma.payoutRequest.findMany({
      where: { user_id: userId },
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
        request_id: item.request_id,
        date: item.requested_at?.toISOString().slice(0, 10) || "",
        amount: Number(item.amount_total),
        status: item.status,
        method: "IBAN",
        bankName: item.bank_name || "",
        iban: item.iban || "",
        realName: item.real_user_fullname || "",
        platform_paid: !!item.platform_paid,
        platform_paid_at: item.platform_paid_at,
        paid_at: item.paid_at,
        rejected_reason: item.rejected_reason,
        updated_at: item.updated_at,
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
        where: { user_id: userId },
        data: {
          iban: body.iban,
          bankName: body.bankName,
          real_user_fullname: body.realName
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
        where: { user_id: userId, status: { in: ["pending", "approved"] } }
      });
      if (activeRequest) {
        return NextResponse.json({ error: "You already have a pending payout request. Wait for it to be processed." }, { status: 400 });
      }

      // Kullanıcı banka & ad snapshot'ı
      const user = await prisma.user.findUnique({
        where: { user_id: userId },
        select: { iban: true, bankName: true, real_user_fullname: true }
      });
      if (!user?.iban || !isValidIbanTR(user.iban)) {
        return NextResponse.json({ error: "Please save a valid IBAN first." }, { status: 400 });
      }
      if (!user?.bankName || !user.bankName.trim()) {
        return NextResponse.json({ error: "Please save your bank name first." }, { status: 400 });
      }
      if (!user?.real_user_fullname || user.real_user_fullname.trim().split(' ').length < 2) {
        return NextResponse.json({ error: "Please save your full real name first." }, { status: 400 });
      }

      // payout_item_id'si null olan confirmed satışlar
      const links = await prisma.affiliateLink.findMany({
        where: { user_id: userId },
        select: { product_id: true }
      });
      const productIds = links.map(l => l.product_id);

      const sales = await prisma.affiliateUserSale.findMany({
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

      return await prisma.$transaction(async (tx) => {
        const payoutReq = await tx.payoutRequest.create({
          data: {
            user_id: userId,
            amount_total: amount,
            status: "pending",
            bank_name: user.bankName,
            iban: user.iban,
            real_user_fullname: user.real_user_fullname,
            platform_paid: false
          }
        });

        for (const sale of sales) {
          const payoutItem = await tx.payoutRequestItems.create({
            data: {
              request_id: payoutReq.request_id,
              merchant_id: sale.merchant_id,
              product_id: sale.product_id,
              amount: sale.commission_affiliate,
              source_sale_ids: sale.sale_id.toString(),
            }
          });
          await tx.affiliateUserSale.update({
            where: { sale_id: sale.sale_id },
            data: { payout_item_id: payoutItem.item_id }
          });
        }

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

    // *** KORUMALI CANCEL: sadece Tüm payout_request_items'lar status==pending ise iptal edebilir ***
    if (body.cancelRequest && body.request_id) {
      return await prisma.$transaction(async (tx) => {
        const reqItem = await tx.payoutRequest.findUnique({
          where: { request_id: body.request_id }
        });
        if (!reqItem || reqItem.user_id !== userId || reqItem.status !== "pending") {
          return NextResponse.json({ error: "Request not found or not cancellable." }, { status: 400 });
        }
        // Bağlı payout_request_items
        const items = await tx.payoutRequestItems.findMany({
          where: { request_id: body.request_id }
        });

        // Süre kontrolü (10 dakika = 600_000 ms)
        const now = new Date();
        const createdAt = new Date(reqItem.requested_at);
        if ((now - createdAt) > 10 * 60 * 1000) {
          return NextResponse.json({
            error: "You can only cancel a payout request within 10 minutes after creation."
          }, { status: 400 });
        }

        // Eğer herhangi bir payout_request_items'ın status'ü "merchant_paid" veya "platform_confirmed" ise: İPTAL YASAK!
        if (items.some(itm => itm.status === "merchant_paid" || itm.status === "platform_confirmed")) {
          return NextResponse.json({ 
            error: "This payout request can no longer be cancelled because the merchant has already marked it as paid. Please contact support if there is a problem." 
          }, { status: 400 });
        }

        // Bağlı satışların payout_item_id'sini null yap
        for (const item of items) {
          if (item.source_sale_ids) {
            const saleIds = item.source_sale_ids.split(',').map(id => Number(id)).filter(Boolean);
            await tx.affiliateUserSale.updateMany({
              where: { sale_id: { in: saleIds }, user_id: userId },
              data: { payout_item_id: null }
            });
          }
        }
        await tx.payoutRequestItems.deleteMany({
          where: { request_id: body.request_id }
        });
        await tx.payoutRequest.update({
          where: { request_id: body.request_id },
          data: {
            status: "rejected",
            rejected_reason: "User cancelled request",
            updated_at: new Date()
          }
        });
        await tx.payout_request_logs.create({
          data: {
            request_id: body.request_id,
            user_id: userId,
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
