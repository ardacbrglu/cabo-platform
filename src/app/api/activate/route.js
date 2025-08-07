// SORUMLULUK: Kayıt endpointi, rate limit ve IP loglaması ile email tabanlı brute-force koruması sağlar.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { checkRateLimit, logApiEvent } from "@/lib/ratelimit"; // Rate limit ve log fonksiyonları ayrı dosyada!
import { sendActivationEmail } from "@/lib/mailer";

const JWT_SECRET = process.env.JWT_SECRET;

export async function POST(req) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  // 1. Rate limit: IP başına dakikada 8 yeni kayıt denemesi
  if (!(await checkRateLimit(`register_${ip}`, 8, 60_000))) {
    await logApiEvent({ endpoint: "register", ip, ua, event: "ratelimit" });
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  const { name, email, password } = await req.json();
  if (!name || !email || !password) {
    await logApiEvent({ endpoint: "register", ip, ua, event: "missing_fields" });
    return NextResponse.json({ error: "Please fill all fields." }, { status: 400 });
  }

  // 2. Email brute-force koruması (email başına kayıt spamı)
  if (!(await checkRateLimit(`register_email_${email}`, 4, 60_000))) {
    await logApiEvent({ endpoint: "register", ip, ua, event: "email_ratelimit", email });
    return NextResponse.json({ error: "Too many attempts for this email. Try later." }, { status: 429 });
  }

  // 3. Kullanıcı varsa brute-force logu
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.status === "active") {
    await logApiEvent({ endpoint: "register", ip, ua, event: "already_registered", email });
    return NextResponse.json({ error: "Already registered." }, { status: 409 });
  }

  // 4. Hash + token + DB save
  const hashed = await bcrypt.hash(password, 10);
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1d" });

  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash: hashed, activationToken: token, status: "pending" },
    create: { name, email, passwordHash: hashed, activationToken: token, status: "pending" }
  });

  await sendActivationEmail(email, token);

  await logApiEvent({ endpoint: "register", ip, ua, event: "register_success", email });

  return NextResponse.json({ ok: true });
}
