// src/app/api/password_reset/request/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { addMinutes } from "date-fns";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { requireOrigin, requireAjax, requireRequestId } from "@/lib/security";
import { audit } from "@/lib/logger";
import { z } from "zod";

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

// NextAuth CSRF (double-submit cookie)
function readCookie(req, name) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function verifyNextAuthCsrf(req) {
  const header = req.headers.get("x-csrf-token");
  if (!header) return false;
  const cookie =
    readCookie(req, "__Host-next-auth.csrf-token") ||
    readCookie(req, "next-auth.csrf-token");
  if (!cookie) return false;
  const [cookieToken] = cookie.split("|");
  return !!cookieToken && header === cookieToken;
}

const messages = {
  en: {
    required: "Email is required.",
    sent: "If user exists, password reset email sent.",
    ratelimit: "Too many requests. Please wait and try again.",
    fail: "Error sending password reset email.",
  },
  tr: {
    required: "E-posta gerekli.",
    sent: "Kullanıcı varsa şifre sıfırlama e-postası gönderildi.",
    ratelimit: "Çok fazla istek. Lütfen tekrar deneyin.",
    fail: "Şifre sıfırlama e-postası gönderilirken hata oluştu.",
  },
};

const BodySchema = z.object({ email: z.string().email().max(254) });

export async function POST(req) {
  const requestId = requireRequestId(req);
  requireOrigin(req);
  requireAjax(req);

  if (!verifyNextAuthCsrf(req)) {
    audit({ evt: "pwreset.request.csrf_fail", requestId });
    return withHeaders(
      NextResponse.json({ success: false, error: "Forbidden", request_id: requestId }, { status: 403 })
    );
  }

  const locale = (req.headers.get("accept-language") || "").toLowerCase().startsWith("tr") ? "tr" : "en";
  const t = (k) => messages[locale][k] ?? k;

  const rl = await checkRateLimit({
    key: makeRateLimitKey(req, { scope: "pwreset_req" }),
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    audit({ evt: "pwreset.request.ratelimit", requestId });
    return withHeaders(
      NextResponse.json(
        { success: false, error: t("ratelimit"), message: t("ratelimit"), request_id: requestId, retry_after: Math.ceil(rl.resetMs / 1000) },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
      )
    );
  }

  let data;
  try {
    data = BodySchema.parse(await req.json());
  } catch {
    return withHeaders(
      NextResponse.json({ success: false, error: t("required"), message: t("required"), request_id: requestId }, { status: 400 })
    );
  }

  const email = data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, languagePreference: true, status: true, passwordHash: true },
  });

  // Enumeration-safe: her durumda success
  if (!user || user.status !== "active") {
    audit({ evt: "pwreset.request.ok.no_user_or_inactive", email: email.slice(0, 3) + "***", requestId });
    return withHeaders(NextResponse.json({ success: true, message: t("sent"), request_id: requestId }));
  }

  // Google ile kayıtlı ve hiç şifre oluşturmamışsa: e-posta ile reset kapalı
  const hasGoogle = await prisma.account.findFirst({
    where: { userId: user.id, provider: "google" },
    select: { id: true },
  });
  if (hasGoogle && !user.passwordHash) {
    audit({ evt: "pwreset.request.google_no_pw_blocked", userId: user.id, requestId });
    return withHeaders(NextResponse.json({ success: true, message: t("sent"), request_id: requestId }));
  }

  // Eski, kullanılmamışları temizle
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, used: false },
  });

  // 15 dk geçerli yeni token
  const token = uuidv4();
  const expiresAt = addMinutes(new Date(), 15);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt, used: false },
  });

  try {
    const lang = user.languagePreference || locale;
    await sendPasswordResetEmail(user.email, token, lang);
  } catch (e) {
    audit({ evt: "pwreset.request.mail_fail", userId: user.id, requestId, err: String(e?.message || e) });
    // enumeration-safe: yine success
    return withHeaders(NextResponse.json({ success: true, message: t("sent"), request_id: requestId }));
  }

  audit({ evt: "pwreset.request.ok", userId: user.id, requestId });
  return withHeaders(NextResponse.json({ success: true, message: t("sent"), request_id: requestId }));
}
