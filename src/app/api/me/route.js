export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma için Edge değil

/**
 * File: src/app/api/me/route.js
 * Purpose: Oturum sahibinin minimal profilini döndürür (id, email, role, status, name).
 * Security Notes:
 * - Auth: getServerSession(authOptions) zorunlu.
 * - Status: requireStatus('active') (pending kullanıcı erişemez).
 * - RateLimit: GET 60/dk (IP bazlı).
 * - Headers: no-store, Vary: Cookie + API güvenlik başlıkları (nosniff, HSTS, vb.).
 * - Error Contract: { error, request_id, retry_after? }.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";
import { requireStatus } from "@/lib/authz";

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return applyApiSecurityHeaders(res);
}

export async function GET(req) {
  // İstemci gönderdi ise kullan; yoksa üret (log korelasyonu)
  const requestId = req.headers.get("x-request-id") || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

  try {
    // 1) Rate limit (60 req/dk, IP bazlı)
    const { ok, resetMs } = await checkRateLimit({
      key: makeRateLimitKey(req, { scope: "me:ip" }),
      limit: 60,
      windowMs: 60_000,
    });
    if (!ok) {
      const res = NextResponse.json(
        { error: "too_many_requests", request_id: requestId },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
      return withHeaders(res);
    }

    // 2) Session
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      audit({ evt: "me.denied", why: "no-session", requestId });
      return withHeaders(NextResponse.json({ error: "unauthorized", request_id: requestId }, { status: 401 }));
    }

    // 3) Status kontrolü (aktif olmayan giremez)
    try {
      requireStatus(session, "active");
    } catch {
      audit({ evt: "me.denied", why: "not-active", userId: session.user.id, requestId });
      return withHeaders(NextResponse.json({ error: "user_not_active", request_id: requestId }, { status: 403 }));
    }

    // 4) Kullanıcıyı doğrula
    const email = session.user.email?.toLowerCase?.();
    if (!email) {
      audit({ evt: "me.denied", why: "no-email", userId: session.user.id, requestId });
      return withHeaders(NextResponse.json({ error: "unauthorized", request_id: requestId }, { status: 401 }));
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, status: true, name: true },
    });

    if (!user) {
      audit({ evt: "me.denied", why: "not-found", email, requestId });
      return withHeaders(NextResponse.json({ error: "unauthorized", request_id: requestId }, { status: 401 }));
    }

    // 5) Başarılı yanıt (minimal alanlar)
    audit({ evt: "me.ok", userId: user.id, requestId });
    return withHeaders(
      NextResponse.json({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        name: user.name || "",
        request_id: requestId,
      })
    );
  } catch (e) {
    audit({ evt: "me.error", err: true, requestId });
    return withHeaders(NextResponse.json({ error: "me_fetch_error", request_id: requestId }, { status: 500 }));
  }
}
