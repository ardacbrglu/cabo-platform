export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // << yolu kendi projenle uyumlu tut

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
      return await prisma.affiliateLink.create({ data: { ...data, token } });
    } catch (e) {
      if (e?.code === "P2002" && Array.isArray(e.meta?.target) && e.meta.target.includes("token")) {
        continue; // çakıştı → tekrar dene
      }
      throw e;
    }
  }
  throw new Error("Could not allocate a unique token after several attempts.");
}

export async function POST(req) {
  try {
    // --- CSRF (mutating endpoint)
    validateCsrfToken(req);

    // --- Rate limit (IP bazlı 10/dk)
    const rlKey = makeRateLimitKey(req, { scope: "products_promote" });
    const { ok, resetMs } = await checkRateLimit({
      key: rlKey,
      limit: 10,
      windowMs: 60_000,
    });
    if (!ok) {
      return json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // --- Auth (NextAuth session)
    const session = await getServerSession(authOptions);
    if (!session?.user) return json({ error: "Unauthorized" }, { status: 401 });

    // userId tercihimiz session.user.id; yoksa e-posta ile resolve
    let userId = session.user.id ?? null;
    if (!userId && session.user.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.user.email.toLowerCase() },
        select: { id: true, role: true, status: true },
      });
      userId = u?.id ?? null;
      // Role/status kontrolü burada da yapılabilir
      if (!u) return json({ error: "Unauthorized" }, { status: 401 });
      if (u.status !== "active") return json({ error: "Account pending" }, { status: 403 });
      if (u.role !== "affiliate") return json({ error: "Forbidden" }, { status: 403 });
    } else {
      // session.user.id geldi ise role/status doğrusu için hızlı kontrol
      const u = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { role: true, status: true },
      });
      if (!u) return json({ error: "Unauthorized" }, { status: 401 });
      if (u.status !== "active") return json({ error: "Account pending" }, { status: 403 });
      if (u.role !== "affiliate") return json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Input
    const body = await req.json().catch(() => ({}));
    const productId = Number(body?.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return json({ error: "Invalid productId" }, { status: 400 });
    }

    // --- Ürün uygun mu?
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

    // --- Var olan link var mı?
    const now = new Date();
    const existing = await prisma.affiliateLink.findFirst({
      where: { userId: Number(userId), productId },
      select: { linkId: true, isVisible: true, expiresAt: true, token: true },
    });

    // Expired ise eskiyi görünmez yapıp yenisini üret
    if (existing && existing.expiresAt && new Date(existing.expiresAt) < now) {
      await prisma.affiliateLink.update({
        where: { linkId: existing.linkId },
        data: { isVisible: false },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + TOKEN_LIFETIME_DAYS);

      const created = await createLinkWithUniqueToken({
        userId: Number(userId),
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
      userId: Number(userId),
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
