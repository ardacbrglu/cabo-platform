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

  // 1. Rate limit
  if (!(await checkRateLimit(`activate_${ip}`, 10, 60_000))) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "ratelimit" });
    return NextResponse.json({ success: false, error: "ratelimit" }, { status: 429 });
  }

  // 2. Token eksikse
  if (!token) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "no_token" });
    return NextResponse.json({ success: false, error: "notoken" }, { status: 400 });
  }

  try {
    // 3. JWT doğrulama
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    // 4. DB'de eşleşen kullanıcı
    const user = await prisma.user.findFirst({
      where: { email, activationToken: token, status: "pending" },
      select: { id: true }
    });

    if (!user) {
      await logApiEvent({ endpoint: "activate", ip, ua, event: "token_invalid", email });
      return NextResponse.json({ success: false, error: "invalid" }, { status: 404 });
    }

    // 5. Kullanıcıyı aktif et
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "active",
        emailVerified: new Date(),
        activationToken: null
      }
    });

    await logApiEvent({ endpoint: "activate", ip, ua, event: "activated", email });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    await logApiEvent({
      endpoint: "activate", ip, ua, event: "jwt_error", error: String(err)
    });
    return NextResponse.json({ success: false, error: "jwt", details: String(err) }, { status: 400 });
  }
}
