export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/activate/route.js
 * Purpose: E-posta aktivasyon linki doğrulama.
 * Security Docblock:
 * - GET idempotent; CSRF gerektirmez. Rate-limit: 10/dk (IP+UserAgent).
 * - Token imzası ve süresi `NEXTAUTH_SECRET` ile doğrulanır.
 * - Yanıtlar no-store + güvenlik header’ları ile döner.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

const ACTIVATION_JWT_SECRET = process.env.NEXTAUTH_SECRET;
if (!ACTIVATION_JWT_SECRET) throw new Error("NEXTAUTH_SECRET is not defined.");

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

const messages = {
  en: {
    ratelimit: "Too many attempts, please wait and try again.",
    notoken: "Activation token is missing.",
    jwt: "Link is malformed or expired.",
    invalid: "Activation link is invalid or expired.",
  },
  tr: {
    ratelimit: "Çok fazla deneme yaptınız, lütfen bekleyin.",
    notoken: "Aktivasyon anahtarı eksik.",
    jwt: "Bağlantı hatalı ya da süresi dolmuş.",
    invalid: "Aktivasyon linki geçersiz veya zaman aşımına uğradı.",
  },
};

export async function GET(req) {
  const locale = (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr") ? "tr" : "en";
  const t = (k) => messages[locale][k] ?? k;

  // Rate limit 10/dk
  const rl = await checkRateLimit({
    key: makeRateLimitKey(req, { scope: "activate" }),
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    audit({ evt: "activate.ratelimit" });
    return withHeaders(
      NextResponse.json(
        { success: false, error: "ratelimit", message: t("ratelimit") },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
      )
    );
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    audit({ evt: "activate.no_token" });
    return withHeaders(NextResponse.json({ success: false, error: "notoken", message: t("notoken") }, { status: 400 }));
  }

  // JWT doğrulama
  let emailFromJwt = null;
  try {
    const payload = jwt.verify(token, ACTIVATION_JWT_SECRET);
    emailFromJwt = String(payload?.email || "").toLowerCase() || null;
  } catch {
    audit({ evt: "activate.jwt_invalid" });
    return withHeaders(NextResponse.json({ success: false, error: "jwt", message: t("jwt") }, { status: 400 }));
  }

  // Token + pending kullanıcıyı bul
  const user = await prisma.user.findFirst({
    where: { activationToken: token, status: "pending", email: emailFromJwt || undefined },
    select: { id: true, email: true },
  });

  if (!user) {
    // Aynı email aktifse alreadyActive kabul et
    const already = await prisma.user.findFirst({
      where: { email: emailFromJwt || undefined, status: "active", activationToken: null },
      select: { id: true },
    });
    if (already) {
      audit({ evt: "activate.already_active", email: emailFromJwt });
      return withHeaders(NextResponse.json({ success: true, alreadyActive: true }, { status: 200 }));
    }
    audit({ evt: "activate.token_invalid", email: emailFromJwt || "unknown" });
    return withHeaders(NextResponse.json({ success: false, error: "invalid", message: t("invalid") }, { status: 404 }));
  }

  // Aktif et
  await prisma.user.update({
    where: { id: user.id },
    data: { status: "active", emailVerified: new Date(), activationToken: null },
  });

  audit({ evt: "activate.ok", email: user.email });
  return withHeaders(NextResponse.json({ success: true }, { status: 200 }));
}
