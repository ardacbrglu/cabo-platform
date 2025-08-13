export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, logApiEvent } from "@/lib/ratelimit";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined.");

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

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
    return json({ success: false, error: "ratelimit" }, { status: 429 });
  }

  // 2) Token eksikse
  if (!token) {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "no_token" });
    return json({ success: false, error: "notoken" }, { status: 400 });
  }

  // 3) JWT doğrulaması (süre, bütünlük)
  let emailFromJwt = null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    emailFromJwt = (payload && payload.email && String(payload.email).toLowerCase()) || null;
  } catch {
    await logApiEvent({ endpoint: "activate", ip, ua, event: "jwt_invalid" });
    return json({ success: false, error: "jwt" }, { status: 400 });
  }

  // 4) Token + pending durumu ile kullanıcıyı bul
  const user = await prisma.user.findFirst({
    where: { activationToken: token, status: "pending", email: emailFromJwt || undefined },
    select: { id: true, email: true },
  });

  if (!user) {
    // 4b) Aynı email aktifse "alreadyActive" de
    const already = await prisma.user.findFirst({
      where: { email: emailFromJwt || undefined, status: "active", activationToken: null },
      select: { id: true, email: true },
    });
    if (already) {
      await logApiEvent({ endpoint: "activate", ip, ua, event: "already_active", email: already.email });
      return json({ success: true, alreadyActive: true }, { status: 200 });
    }

    await logApiEvent({ endpoint: "activate", ip, ua, event: "token_invalid", email: emailFromJwt || "unknown" });
    return json({ success: false, error: "invalid" }, { status: 404 });
  }

  // 5) Kullanıcıyı aktif et
  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: "active",
      emailVerified: new Date(),
      activationToken: null,
    },
  });

  await logApiEvent({ endpoint: "activate", ip, ua, event: "activated", email: user.email });

  return json({ success: true }, { status: 200 });
}
