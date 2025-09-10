// src/app/api/settings/change_password/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/settings/change_password
 * - Auth, CSRF (+ same-site fallback), RL
 * - Google-only (passwordHash yok) → current gereksiz; firstTimeSet
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/ratelimit";
import { cookies } from "next/headers";

/* ---------- helpers ---------- */
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
  const raw =
    store.get("__Host-next-auth.csrf-token")?.value ||
    store.get("next-auth.csrf-token")?.value ||
    "";
  return String(raw).split("|")[0] || "";
}
function validateCsrfOrTrustSameSite(req) {
  const method = req?.method?.toUpperCase?.() || "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;

  const headerToken =
    req.headers.get("X-CSRF-Token") ||
    req.headers.get("x-csrf-token") ||
    "";
  const cookieToken = readCsrfCookieValue();
  if (headerToken && cookieToken && headerToken === cookieToken) return null;

  const selfOrigin = new URL(req.url).origin;
  const envOrigin = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : selfOrigin;
  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  const refererOrigin = referer ? (() => { try { return new URL(referer).origin; } catch { return ""; } })() : "";
  const sameSite = (origin && origin === envOrigin) || (refererOrigin && refererOrigin === envOrigin);
  if (sameSite && cookieToken) return null;

  return secureJson({ success: false, errorKey: "csrf" }, { status: 403 });
}

/* ---------- schema ---------- */
const PasswordSchema = z.object({
  current_password: z.string().optional(),
  new_password: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/),
});

export async function POST(req) {
  try {
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return secureJson({ success: false, errorKey: "unsupported_media" }, { status: 415 });
    }

    // CSRF (with same-site fallback)
    const csrfErr = validateCsrfOrTrustSameSite(req);
    if (csrfErr) return csrfErr;

    // Auth
    const session = await getServerSession(authOptions);
    const userId = Number(session?.user?.id ?? session?.user?.userId ?? NaN);
    if (!Number.isFinite(userId)) {
      return secureJson({ success: false, errorKey: "unauthorized" }, { status: 401 });
    }

    // RL
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:pwd:u:${userId}`,
      limit: 3,
      windowMs: 15 * 60_000,
    });
    if (!ok) {
      return secureJson(
        { success: false, errorKey: "too_many" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetMs || 0) / 1000)) } },
      );
    }

    // Body
    const body = await req.json().catch(() => ({}));
    const parsed = PasswordSchema.safeParse(body);
    if (!parsed.success) {
      return secureJson({ success: false, errorKey: "invalid_payload" }, { status: 400 });
    }
    const { current_password, new_password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) return secureJson({ success: false, errorKey: "unauthorized" }, { status: 401 });

    // aynı şifre kontrolü
    if (user.passwordHash) {
      const same = await bcrypt.compare(new_password, user.passwordHash);
      if (same) {
        return secureJson({ success: false, errorKey: "must_different" }, { status: 400 });
      }
    }

    // Google-only → current gereksiz
    if (!user.passwordHash) {
      if (current_password && current_password.length > 0) {
        return secureJson({ success: false, errorKey: "no_password_nowarn" }, { status: 400 });
      }
      const newHash = await bcrypt.hash(new_password, 12);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
        try { await tx.session.deleteMany({ where: { userId } }); } catch {}
      });
      return secureJson({ success: true, firstTimeSet: true });
    }

    // Parolası VAR → current zorunlu
    if (!current_password) {
      return secureJson({ success: false, errorKey: "current_required" }, { status: 400 });
    }

    const okPw = await bcrypt.compare(current_password, user.passwordHash);
    if (!okPw) {
      return secureJson({ success: false, errorKey: "current_wrong" }, { status: 403 });
    }

    // Güncelle
    const newHash = await bcrypt.hash(new_password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
      try { await tx.session.deleteMany({ where: { userId } }); } catch {}
    });

    return secureJson({ success: true });
  } catch (err) {
    console.error("POST /api/settings/change_password error:", err);
    return secureJson({ success: false, errorKey: "server" }, { status: 500 });
  }
}
