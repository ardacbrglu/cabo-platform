// src/app/api/password_reset/confirm/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { cookies } from "next/headers";

function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

function readCsrfCookieValue() {
  const store = cookies();
  const candidates = [
    "__Host-next-auth.csrf-token",
    "next-auth.csrf-token",
    "__Secure-next-auth.csrf-token",
  ];
  for (const name of candidates) {
    const raw = store.get(name)?.value || "";
    const v = String(raw).split("|")[0];
    if (v) return v;
  }
  return "";
}

const BodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
  csrfToken: z.string().optional(),
});

export async function POST(req) {
  try {
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return secureJson({ error: "Unsupported Media Type" }, { status: 415 });
    }

    // IP rate-limit
    const rlKey = makeRateLimitKey(req, { scope: "pwreset_confirm:ip" });
    const rl = await checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    if (!rl.ok) {
      return secureJson(
        { error: "Too many attempts" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return secureJson({ error: "Invalid payload" }, { status: 400 });

    // ✅ CSRF (header veya body.csrfToken)
    const headerToken = req.headers.get("X-CSRF-Token") || req.headers.get("x-csrf-token") || "";
    const cookieToken = readCsrfCookieValue();
    const provided = headerToken || parsed.data.csrfToken || "";
    if (!provided || !cookieToken || provided !== cookieToken) {
      console.warn("pwreset.confirm.csrf_fail");
      return secureJson({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { token, password } = parsed.data;

    // Token doğrula (used:boolean + expiresAt)
    const rec = await prisma.passwordResetToken.findUnique({
      where: { token },
      select: { id: true, userId: true, used: true, expiresAt: true },
    });

    if (!rec || rec.used || (rec.expiresAt && rec.expiresAt < new Date())) {
      return secureJson({ error: "Invalid or expired token" }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: rec.userId },
        data: { passwordHash: hash },
      }),
      prisma.passwordResetToken.update({
        where: { id: rec.id },
        data: { used: true },
      }),
    ]);

    return secureJson({ success: true });
  } catch (err) {
    console.error("POST /api/password_reset/confirm error:", err);
    return secureJson({ error: "Server error" }, { status: 500 });
  }
}
