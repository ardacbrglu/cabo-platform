export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { checkRateLimit, logApiEvent } from "@/lib/ratelimit";

const JWT_SECRET = process.env.JWT_SECRET;

export async function GET(req) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  // 1. Rate limit: IP başına dakikada 10 aktivasyon denemesi
  if (!(await checkRateLimit(`activate_${ip}`, 10, 60_000))) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "ratelimit" });
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }

  if (!token) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "no_token" });
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    // Token hijacking/logical brute-force: DB'deki activationToken ile eşleşiyor mu?
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true, activationToken: true }
    });

    if (!user || user.status === "active" || user.activationToken !== token) {
      await logApiEvent({ endpoint: "activate", ip, ua, event: "token_invalid", email });
      return NextResponse.redirect(new URL("/activated?error=1", req.url));
    }

    await prisma.user.update({
      where: { email },
      data: {
        status: "active",
        emailVerified: new Date(),
        activationToken: null
      },
    });

    await logApiEvent({ endpoint: "activate", ip, ua, event: "activated", email });

    return NextResponse.redirect(new URL("/activated", req.url));
  } catch (err) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "jwt_error", error: String(err) });
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }
}
