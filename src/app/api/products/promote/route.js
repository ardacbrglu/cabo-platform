export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TOKEN_LIFETIME_DAYS = 14;

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

function generateToken() {
  // 8 byte → 16 hex (64-bit entropi)
  return crypto.randomBytes(8).toString("hex");
}

// DB-level unique + yarış koşulu için retry
async function createLinkWithUniqueToken(data, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const token = generateToken();
    try {
      return await prisma.affiliateLink.create({
        data: { ...data, token },
      });
    } catch (e) {
      if (e?.code === "P2002" && Array.isArray(e.meta?.target) && e.meta.target.includes("token")) {
        // token çakıştı → tekrar dene
        continue;
      }
      throw e;
    }
  }
  throw new Error("Could not allocate a unique token after several attempts.");
}

export async function POST(req) {
  try {
    // --- CSRF (mutating endpoint) ---
    validateCsrfToken(req);

    // --- Rate limit (user/IP bazlı 10/dk) ---
    const rlKey = makeRateLimitKey(req, { scope: "products_promote" });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    if (!ok) {
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // --- Auth (JWT cookie) ---
    const cookieStore = cookies();
    const raw = cookieStore.get("cabo_token")?.value;
    if (!raw || !JWT_SECRET) return json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = jwt.verify(raw, JWT_SECRET);
    } catch {
      return json({ error: "Invalid token" }, { status: 403 });
    }

    const userId = Number(payload?.userId);
    if (!Number.isFinite(userId)) return json({ error: "Unauthorized" }, { status: 401 });

    // --- Input ---
    const body = await req.json().catch(() => ({}));
    const productId = Number(body?.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return json({ error: "Invalid productId" }, { status: 400 });
    }

    // --- Ürün uygun mu? ---
    const product = await prisma.merchantProduct.findUnique({
      where: { productId },
      select: {
        isActive: true,
        activatedByAdmin: true,
        totalPurchases: true,
        maxSalesLimit: true,
      },
    });
    if (!product || !product.isActive) {
      return json({ error: "This product is not active." }, { status: 403 });
    }
    if (!product.activatedByAdmin) {
      return json({ error: "This product is not yet approved by admin." }, { status: 403 });
    }
    if (product.maxSalesLimit != null && product.totalPurchases >= product.maxSalesLimit) {
      return json({ error: "This product has reached its sales quota." }, { status: 403 });
    }

    // --- Var olan link var mı? ---
    const now = new Date();
    const existing = await prisma.affiliateLink.findFirst({
      where: { userId, productId },
      select: { linkId: true, isVisible: true, expiresAt: true, token: true },
    });

    // Expired ise eskiyi görünmez yapıp yeni üret
    if (existing && existing.expiresAt && new Date(existing.expiresAt) < now) {
      await prisma.affiliateLink.update({
        where: { linkId: existing.linkId },
        data: { isVisible: false },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

      const created = await createLinkWithUniqueToken({
        userId,
        productId,
        isVisible: true,
        createdAt: new Date(),
        expiresAt,
      });

      return json({
        message: "Created new token (expired before)",
        token: created.token,
        expiresAt: created.expiresAt,
      });
    }

    // Mevcut ve aktifse görünür yapıp aynı token'ı döndür
    if (existing) {
      if (!existing.isVisible) {
        await prisma.affiliateLink.update({
          where: { linkId: existing.linkId },
          data: { isVisible: true },
        });
      }
      return json({
        message: "Already exists",
        token: existing.token,
        expiresAt: existing.expiresAt || null,
      });
    }

    // İlk kez oluştur
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

    const created = await createLinkWithUniqueToken({
      userId,
      productId,
      isVisible: true,
      createdAt: new Date(),
      expiresAt,
    });

    return json({
      message: "Created",
      token: created.token,
      expiresAt: created.expiresAt,
    });
  } catch (err) {
    console.error("Promote API error:", err);
    return json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
