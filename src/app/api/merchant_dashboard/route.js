// app/api/merchant_dashboard/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { cookies } from "next/headers";
import { csrf } from "@/lib/csrf"; // POST/PATCH için zorunlu
import { checkRateLimit } from "@/lib/ratelimit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

// Basit XSS koruma + trim
function sanitizeString(str) {
  return String(str || "")
    .replace(/[<>&"'`]/g, "")
    .replace(/[\u0000-\u001F]+/g, "")
    .trim();
}

// URL format kontrolü
function isValidUrl(url) {
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url);
}

// --------- GET: Merchant dashboard verileri ---------
export const GET = async (req) => {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(`merchant_dashboard_get_${ip}`, 30, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let minCommission = 5;
    try {
      const config = await prisma.platform_config.findUnique({
        where: { key_name: "min_commission" },
      });
      minCommission = config ? parseFloat(config.value) : 5;
    } catch {
      minCommission = 5;
    }

    const products = await prisma.merchantProduct.findMany({
      where: { merchantId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        productId: true,
        name: true,
        description: true,
        image_url: true,
        merchant_url: true,
        commissionRate: true,
        isActive: true,
        totalClicks: true,
        total_purchases: true,
        max_sales_limit: true,
        createdAt: true,
        price: true,
        activated_by_admin: true,
        productCode: true,
        affiliateLinks: {
          select: { linkId: true },
          where: { isVisible: true },
        },
      },
    });

    const formatted = products.map((p) => ({
      ...p,
      link_count: p.affiliateLinks.length,
      remaining_quota: Math.max(0, p.max_sales_limit - p.total_purchases),
    }));

    return NextResponse.json({ success: true, products: formatted, minCommission });
  } catch (err) {
    console.error("Dashboard Fetch Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

// --------- POST: Yeni ürün ekleme ---------
export const POST = csrf(async (req) => {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(`merchant_dashboard_post_${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description,
      image_url,
      price,
      commissionRate,
      merchant_url,
      max_sales_limit,
    } = body;

    if (!name || !image_url || !merchant_url || !price || !commissionRate || !max_sales_limit) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const safeName = sanitizeString(name);
    const safeDesc = sanitizeString(description || "");
    const safeImg = sanitizeString(image_url);
    const safeUrl = sanitizeString(merchant_url);

    if (!isValidUrl(safeImg) || !isValidUrl(safeUrl)) {
      return NextResponse.json({ error: "Invalid image or merchant URL." }, { status: 400 });
    }

    const priceValue = parseFloat(price);
    const commissionValue = parseFloat(commissionRate);
    const limitValue = parseInt(max_sales_limit);

    if (
      Number.isNaN(priceValue) ||
      priceValue <= 0 ||
      Number.isNaN(commissionValue) ||
      commissionValue <= 0 ||
      Number.isNaN(limitValue) ||
      limitValue < 0
    ) {
      return NextResponse.json({ error: "Invalid price, commission rate or sales limit." }, { status: 400 });
    }

    let minCommission = 5;
    try {
      const config = await prisma.platform_config.findUnique({
        where: { key_name: "min_commission" },
      });
      minCommission = config ? parseFloat(config.value) : 5;
    } catch {
      minCommission = 5;
    }

    if (commissionValue < minCommission) {
      return NextResponse.json({
        error: `Commission rate must be at least ${minCommission}%`,
      }, { status: 400 });
    }

    const productCode = crypto.randomBytes(16).toString("hex");

    const newProduct = await prisma.merchantProduct.create({
      data: {
        merchantId: session.user.id,
        name: safeName,
        description: safeDesc,
        image_url: safeImg,
        price: priceValue,
        commissionRate: commissionValue,
        merchant_url: safeUrl,
        max_sales_limit: limitValue,
        productCode,
      },
    });

    return NextResponse.json({ success: true, productId: newProduct.productId });
  } catch (err) {
    console.error("Product Create Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});

// --------- PATCH: Ürün güncelleme ---------
export const PATCH = csrf(async (req) => {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (!checkRateLimit(`merchant_dashboard_patch_${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "merchant") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { productId, commissionRate, max_sales_limit, action } = body;

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    let minCommission = 5;
    try {
      const config = await prisma.platform_config.findUnique({
        where: { key_name: "min_commission" },
      });
      minCommission = config ? parseFloat(config.value) : 5;
    } catch {
      minCommission = 5;
    }

    const dataToUpdate = {};
    let editTriggered = false;

    if (commissionRate !== undefined) {
      const crNum = Number(commissionRate);
      if (Number.isNaN(crNum)) {
        return NextResponse.json({ error: "commissionRate must be a number" }, { status: 400 });
      }
      if (crNum < minCommission) {
        return NextResponse.json({
          error: `Commission rate must be at least ${minCommission}%`,
        }, { status: 400 });
      }
      dataToUpdate.commissionRate = crNum;
      editTriggered = true;
    }

    if (max_sales_limit !== undefined) {
      const mslNum = Number(max_sales_limit);
      if (!Number.isInteger(mslNum) || mslNum < 0) {
        return NextResponse.json({
          error: "max_sales_limit must be a non-negative integer",
        }, { status: 400 });
      }
      dataToUpdate.max_sales_limit = mslNum;
      editTriggered = true;
    }

    if (editTriggered) {
      dataToUpdate.activated_by_admin = false;
      dataToUpdate.isActive = false;
    }

    if (action === "deactivate") {
      dataToUpdate.isActive = false;
    } else if (action === "activate") {
      dataToUpdate.isActive = true;
    }

    const product = await prisma.merchantProduct.findUnique({
      where: { productId: Number(productId) },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product.merchantId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized to update this product" }, { status: 403 });
    }

    const updated = await prisma.merchantProduct.update({
      where: { productId: Number(productId) },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, updatedProduct: updated });
  } catch (err) {
    console.error("Product Patch Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
