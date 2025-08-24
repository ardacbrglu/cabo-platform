// /app/api/support/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey, logApiEvent } from "@/lib/ratelimit";
import { verifyCaptchaServer } from "@/lib/captcha";
import { z } from "zod";
import { cookies } from "next/headers";

// ---- Ayarlar
const SUPPORT_RATE_LIMIT = { limit: 5, windowMs: 60_000 }; // 5/dk
const SUPPORT_DAILY_CAP = Number(process.env.SUPPORT_DAILY_CAP ?? "20"); // 20/gün

// ---- Zod şeması
const supportSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(900, "Message too long"),
});

// ---- Basit plaintext sanitize
function sanitizePlaintext(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function getIP(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

// ---- CSRF: NextAuth cookie ↔ header eşleşmesi (apiFetch ile uyumlu)
function readCsrfCookieValue() {
  const store = cookies();
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}
function validateCsrfOrDeny(req) {
  const method = req?.method?.toUpperCase?.() || "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  const headerToken =
    req.headers.get("X-CSRF-Token") ||
    req.headers.get("x-csrf-token") ||
    "";
  const cookieToken = readCsrfCookieValue();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return secureJson({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

// ---- Handler
export async function POST(req) {
  const ip = getIP(req);
  const ua = req.headers.get("user-agent") || "";

  try {
    // Content-Type
    const ct = String(req.headers.get("content-type") || "");
    if (!ct.toLowerCase().includes("application/json")) {
      return secureJson({ error: "Unsupported Media Type" }, { status: 415 });
    }

    // CSRF
    const csrfErr = validateCsrfOrDeny(req);
    if (csrfErr) return csrfErr;

    // Auth
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return secureJson({ error: "Unauthorized" }, { status: 401 });

    // Rate limit (kullanıcı bazlı)
    const rlKey = makeRateLimitKey(req, { scope: "support", userId });
    const { ok, resetMs } = await checkRateLimit({
      key: rlKey,
      limit: SUPPORT_RATE_LIMIT.limit,
      windowMs: SUPPORT_RATE_LIMIT.windowMs,
    });
    if (!ok) {
      await logApiEvent({ endpoint: "/api/support", ip, ua, event: "rate_limited" });
      return secureJson(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } }
      );
    }

    // Body + validation
    const raw = await req.json().catch(() => ({}));
    const parsed = supportSchema.safeParse(raw);
    if (!parsed.success) return secureJson({ error: "Invalid payload" }, { status: 400 });

    // Sanitize
    const cleanMessage = sanitizePlaintext(parsed.data.message);
    if (!cleanMessage) return secureJson({ error: "Message is required" }, { status: 400 });

    // Günlük kota
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyCount = await prisma.contactMessage.count({
      where: { userId, submittedAt: { gte: since } },
    });
    if (dailyCount >= SUPPORT_DAILY_CAP) {
      await logApiEvent({ endpoint: "/api/support", ip, ua, event: "daily_cap" });
      return secureJson({ error: "Too many requests" }, { status: 429 });
    }

    // CAPTCHA (header: x-recaptcha-token)
    const captchaToken = req.headers.get("x-recaptcha-token");
    const captchaRes = await verifyCaptchaServer({ token: captchaToken, ip });
    if (!captchaRes.ok) {
      await logApiEvent({ endpoint: "/api/support", ip, ua, event: "captcha_failed" });
      return secureJson({ error: "Captcha verification failed" }, { status: 400 });
    }

    // Kullanıcı bilgisi
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { name: true, email: true },
    });
    if (!user) return secureJson({ error: "User not found" }, { status: 404 });

    // Kaydet
    await prisma.contactMessage.create({
      data: {
        userId: Number(userId),
        name: user.name || null,
        email: user.email || null,
        message: cleanMessage,
      },
    });

    await logApiEvent({
      endpoint: "/api/support",
      ip,
      ua,
      event: "message_created",
      email: user.email || null,
    });

    return secureJson({ success: true });
  } catch (err) {
    await logApiEvent({
      endpoint: "/api/support",
      ip,
      ua,
      event: "error",
      error: err?.message?.slice(0, 200) || String(err).slice(0, 200),
    });
    return secureJson({ error: "Server error" }, { status: 500 });
  }
}
