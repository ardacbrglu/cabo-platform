// app/api/support/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { withCsrfProtection } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey, logApiEvent } from "@/lib/ratelimit";
import { z } from "zod";

const supportSchema = z.object({
  message: z
    .string()
    .transform((s) => s.trim())
    .min(1, "Message is required")
    .max(900, "Message too long"),
});

// Basit plaintext temizleme (HTML tag + kontrol karakterleri)
function sanitizePlaintext(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

// (Opsiyonel) reCAPTCHA doğrulama
async function verifyCaptcha(req) {
  const token = req.headers.get("x-recaptcha-token");
  if (!token) return false;
  const secret = process.env.RECAPTCHA_SECRET; // Enterprise/hCaptcha ise uygun secret
  if (!secret) return true; // secret yoksa doğrulamayı pas geç (dev)
  try {
    // Burada fetch ile Google/HCaptcha verify servisine POST atarsın.
    // Prod'da timeout ve hata yakalama ekleyin.
    // return resp.success === true;
    return true; // örnek
  } catch {
    return false;
  }
}

export const POST = withCsrfProtection(async (req) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "";

  try {
    // 0) Content-Type kontrolü
    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "Unsupported Media Type" }, { status: 415 });
    }

    // 1) Auth
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Rate limit (5/dk kullanıcı bazlı)
    const rlKey = makeRateLimitKey(req, { scope: "support", userId });
    const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    if (!ok) {
      await logApiEvent({ endpoint: "/api/support", ip, ua, event: "rate_limited" });
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 3) Body parse + validation
    const raw = await req.json().catch(() => ({}));
    const parsed = supportSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 4) Sanitize + tekrar min kontrol
    const cleanMessage = sanitizePlaintext(parsed.data.message);
    if (!cleanMessage || cleanMessage.length < 1) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // 5) (Opsiyonel) Captcha doğrula
    const captchaOk = await verifyCaptcha(req);
    if (!captchaOk) {
      await logApiEvent({ endpoint: "/api/support", ip, ua, event: "captcha_failed" });
      return NextResponse.json({ error: "Captcha verification failed" }, { status: 400 });
    }

    // 6) Kullanıcı bilgisi
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 7) Mesajı kaydet
    await prisma.contactMessage.create({
      data: {
        userId,
        name: user.name || null,
        email: user.email || null,
        message: cleanMessage,
      },
    });

    await logApiEvent({ endpoint: "/api/support", ip, ua, event: "message_created", email: user.email });

    return NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Vary": "Cookie",
        },
      }
    );
  } catch (err) {
    await logApiEvent({
      endpoint: "/api/support",
      ip,
      ua,
      event: "error",
      error: err?.message?.slice(0, 200) || String(err).slice(0, 200),
    });
    return NextResponse.json(
      { error: "Server error" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "Vary": "Cookie",
        },
      }
    );
  }
});
