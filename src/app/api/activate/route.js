// app/api/activate/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, logApiEvent } from "@/lib/ratelimit";

export async function GET(req) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  // 1) Rate limit: IP başına dakikada 10 deneme
  const rl = await checkRateLimit({
    key: `activate:${ip}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "ratelimit" });
    return NextResponse.json({ success: false, error: "ratelimit" }, { status: 429 });
  }

  // 2) Token eksikse
  if (!token) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "no_token" });
    return NextResponse.json({ success: false, error: "notoken" }, { status: 400 });
  }

  // 3) DB'de eşleşen kullanıcı: pending + activationToken eşit olmalı
  const user = await prisma.user.findFirst({
    where: { activationToken: token, status: "pending" },
    select: { id: true, email: true },
  });

  // 3b) Kullanıcı zaten aktifse
  if (!user) {
    const alreadyActive = await prisma.user.findFirst({
      where: { activationToken: null, status: "active" },
      select: { id: true, email: true },
    });
    if (alreadyActive) {
      await logApiEvent({
        endpoint: "activate",
        ip,
        ua,
        event: "already_active",
        email: alreadyActive.email,
      });
      return NextResponse.json({ success: true, alreadyActive: true }, { status: 200 });
    }
    await logApiEvent({ endpoint: "activate", ip, ua, event: "token_invalid" });
    return NextResponse.json({ success: false, error: "invalid" }, { status: 404 });
  }

  // 4) Kullanıcıyı aktif et
  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: "active",
      emailVerified: new Date(),
      activationToken: null,
    },
  });

  await logApiEvent({
    endpoint: "activate",
    ip,
    ua,
    event: "activated",
    email: user.email,
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
