import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";
const TOKEN_LIFETIME_DAYS = 14;

function generateToken() {
  return crypto.randomBytes(8).toString("hex");
}

export async function POST(req) {
  try {
    // KULLANICI DOĞRULAMA
    const cookieStore = await cookies();
    const token = cookieStore.get('cabo_token')?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    const userId = payload.user_id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { product_id } = body;
    // Güvenlik: product_id sayısal mı?
    if (!product_id || isNaN(Number(product_id))) {
      return NextResponse.json({ error: "Invalid product_id" }, { status: 400 });
    }

    // 1️⃣ Ürün aktif/uygun mu?
    const product = await prisma.merchantProduct.findUnique({
      where: { product_id: Number(product_id) },
      select: {
        is_active: true,
        activated_by_admin: true,
        total_purchases: true,
        max_sales_limit: true
      }
    });
    if (!product || !product.is_active) {
      return NextResponse.json({ error: "This product is not active." }, { status: 403 });
    }
    if (!product.activated_by_admin) {
      return NextResponse.json({ error: "This product is not yet approved by admin." }, { status: 403 });
    }
    if (product.max_sales_limit != null && product.total_purchases >= product.max_sales_limit) {
      return NextResponse.json({ error: "This product has reached its sales quota." }, { status: 403 });
    }

    // 2️⃣ Kullanıcıya ait bu ürün için link var mı?
    let existing = await prisma.affiliateLink.findFirst({
      where: {
        user_id: userId,
        product_id: Number(product_id)
      }
    });

    const now = new Date();

    if (existing) {
      // Eğer expire olmuşsa yeni token oluştur
      if (existing.expires_at && new Date(existing.expires_at) < now) {
        // Eskiyi inaktif yap
        await prisma.affiliateLink.update({
          where: { link_id: existing.link_id },
          data: { is_visible: false }
        });

        // Yeni token üret ve kaydet
        let newToken, exists = true;
        while (exists) {
          newToken = generateToken();
          exists = await prisma.affiliateLink.findFirst({ where: { token: newToken } });
        }
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

        const created = await prisma.affiliateLink.create({
          data: {
            user_id: userId,
            product_id: Number(product_id),
            token: newToken,
            is_visible: true,
            created_at: new Date(),
            expires_at: expiresAt
          },
        });

        return NextResponse.json({
          message: "Created new token (expired before)",
          token: created.token,
          expires_at: created.expires_at
        });
      }
      // Hala aktif, sadece görünebilir yap ve token döndür
      if (!existing.is_visible) {
        await prisma.affiliateLink.update({
          where: { link_id: existing.link_id },
          data: { is_visible: true }
        });
      }
      return NextResponse.json({
        message: "Already exists",
        token: existing.token,
        expires_at: existing.expires_at
      });
    }

    // 3️⃣ İlk defa token üret
    let newToken;
    let exists = true;
    while (exists) {
      newToken = generateToken();
      exists = await prisma.affiliateLink.findFirst({ where: { token: newToken } });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

    const created = await prisma.affiliateLink.create({
      data: {
        user_id: userId,
        product_id: Number(product_id),
        token: newToken,
        is_visible: true,
        created_at: new Date(),
        expires_at: expiresAt
      },
    });

    return NextResponse.json({
      message: "Created",
      token: created.token,
      expires_at: created.expires_at
    });

  } catch (err) {
    console.error("Promote API error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
