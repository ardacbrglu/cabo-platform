// ✅ app/api/activate/route.js
// Kullanıcı aktivasyon işlemlerini güvenli şekilde yürütür.
// Token doğrulaması yapar, kullanıcıyı aktif eder, loglar.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { checkRateLimit, logApiEvent } from "@/lib/ratelimit";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is missing.");

export async function GET(req) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  // 🔐 1. Rate limit: IP başına dakikada 10 deneme
  if (!(await checkRateLimit(`activate_${ip}`, 10, 60_000))) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "ratelimit" });
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }

  // ❌ 2. Token eksikse
  if (!token) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "no_token" });
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }

  try {
    // 🔐 3. JWT decode et (imzayı kontrol et)
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    // 🔐 4. DB'de hem email hem token birebir eşleşen kullanıcıyı bul
    const user = await prisma.user.findFirst({
      where: {
        email,
        activationToken: token,
        status: "pending", // sadece bekleyen kullanıcılar
      },
      select: { id: true }
    });

    // ❌ Kullanıcı bulunamazsa veya token geçersizse
    if (!user) {
      await logApiEvent({ endpoint: "activate", ip, ua, event: "token_invalid", email });
      return NextResponse.redirect(new URL("/activated?error=1", req.url));
    }

    // ✅ 5. Kullanıcıyı aktif hale getir
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "active",
        emailVerified: new Date(),
        activationToken: null, // Token tek kullanımlık, iptal edilir
      },
    });

    await logApiEvent({ endpoint: "activate", ip, ua, event: "activated", email });

    return NextResponse.redirect(new URL("/activated", req.url));
  } catch (err) {
    // ❌ JWT doğrulama hatası
    await logApiEvent({
      endpoint: "activate",
      ip,
      ua,
      event: "jwt_error",
      error: String(err)
    });
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }
}
