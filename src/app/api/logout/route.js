// app/api/logout/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey, logApiEvent } from "@/lib/ratelimit";

/**
 * SECURITY
 * - Sadece POST; CSRF zorunlu.
 * - JWT strategy: session cookie’lerini silmek yeterli.
 * - __Secure- ve __Host- varyantlarını da temizliyoruz.
 */

const isProd = process.env.NODE_ENV === "production";
const SECURE = isProd ? " Secure;" : "";

function json(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function POST(req) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  // 1) Rate limit
  const rlKey = makeRateLimitKey(req, { scope: "logout" });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  if (!ok) {
    try { await logApiEvent?.({ endpoint: "logout", ip, ua, event: "ratelimit" }); } catch {}
    return json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
    );
  }

  try {
    // 2) CSRF (header+cookie doğrulaması)
    try {
      await validateCsrfToken(req);
    } catch {
      try { await logApiEvent?.({ endpoint: "logout", ip, ua, event: "csrf_fail" }); } catch {}
      return json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // 3) Oturumu (opsiyonel) log için oku
    const session = await auth();

    // 4) Yanıt
    const res = json({ success: true }, { status: 200 });

    // 5) NextAuth cookie isimleri (tüm varyasyonlar)
    const cookieNames = [
      // session
      "__Host-next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.session-token",
      // callback-url
      "__Host-next-auth.callback-url",
      "__Secure-next-auth.callback-url",
      "next-auth.callback-url",
      // csrf
      "__Host-next-auth.csrf-token",
      "__Secure-next-auth.csrf-token",
      "next-auth.csrf-token",
      // legacy/custom: varsa temizle
      "cabo_token",
    ];

    for (const name of cookieNames) {
      res.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${SECURE}`
      );
    }

    try {
      await logApiEvent?.({
        endpoint: "logout",
        ip,
        ua,
        event: session ? "ok" : "ok_no_session",
        email: session?.user?.email || null,
      });
    } catch {}

    return res;
  } catch (err) {
    try {
      await logApiEvent?.({ endpoint: "logout", ip, ua, event: "error", error: err?.message || String(err) });
    } catch {}
    return json({ error: "Logout failed" }, { status: 400 });
  }
}
