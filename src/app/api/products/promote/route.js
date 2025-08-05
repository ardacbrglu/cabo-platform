export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
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

    const userId = payload.userId;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { productId } = body;
    // Güvenlik: productId sayısal mı?
    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
    }

    // 1️⃣ Ürün aktif/uygun mu?
    const product = await prisma.merchantProduct.findUnique({
      where: { productId: Number(productId) },
      select: {
        isActive: true,
        activatedByAdmin: true,
        totalPurchases: true,
        maxSalesLimit: true
      }
    });
    if (!product || !product.isActive) {
      return NextResponse.json({ error: "This product is not active." }, { status: 403 });
    }
    if (!product.activatedByAdmin) {
      return NextResponse.json({ error: "This product is not yet approved by admin." }, { status: 403 });
    }
    if (product.maxSalesLimit != null && product.totalPurchases >= product.maxSalesLimit) {
      return NextResponse.json({ error: "This product has reached its sales quota." }, { status: 403 });
    }

    // 2️⃣ Kullanıcıya ait bu ürün için link var mı?
    let existing = await prisma.affiliateLink.findFirst({
      where: {
        userId: userId,
        productId: Number(productId)
      }
    });

    const now = new Date();

    if (existing) {
      // Eğer expire olmuşsa yeni token oluştur
      if (existing.expiresAt && new Date(existing.expiresAt) < now) {
        // Eskiyi inaktif yap
        await prisma.affiliateLink.update({
          where: { linkId: existing.linkId },
          data: { isVisible: false }
        });

        // Yeni token üret ve kaydet
        let newToken, tokenExists = true;
        while (tokenExists) {
          newToken = generateToken();
          tokenExists = await prisma.affiliateLink.findFirst({ where: { token: newToken } });
        }
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

        const created = await prisma.affiliateLink.create({
          data: {
            userId: userId,
            productId: Number(productId),
            token: newToken,
            isVisible: true,
            createdAt: new Date(),
            expiresAt: expiresAt
          },
        });

        return NextResponse.json({
          message: "Created new token (expired before)",
          token: created.token,
          expiresAt: created.expiresAt
        });
      }
      // Hala aktif, sadece görünebilir yap ve token döndür
      if (!existing.isVisible) {
        await prisma.affiliateLink.update({
          where: { linkId: existing.linkId },
          data: { isVisible: true }
        });
      }
      return NextResponse.json({
        message: "Already exists",
        token: existing.token,
        expiresAt: existing.expiresAt
      });
    }

    // 3️⃣ İlk defa token üret
    let newToken;
    let tokenExists = true;
    while (tokenExists) {
      newToken = generateToken();
      tokenExists = await prisma.affiliateLink.findFirst({ where: { token: newToken } });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

    const created = await prisma.affiliateLink.create({
      data: {
        userId: userId,
        productId: Number(productId),
        token: newToken,
        isVisible: true,
        createdAt: new Date(),
        expiresAt: expiresAt
      },
    });

    return NextResponse.json({
      message: "Created",
      token: created.token,
      expiresAt: created.expiresAt
    });

  } catch (err) {
    console.error("Promote API error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
