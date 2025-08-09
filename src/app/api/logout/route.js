// app/api/logout/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey, logApiEvent } from "@/lib/ratelimit";

/**
 * SECURITY NOTES
 * - Sadece POST; CSRF zorunlu (header + cookie).
 * - NextAuth JWT stratejisinde session cookie’lerini temizlemek yeterli.
 * - Üretimde __Secure-* isimleri de silinir. Custom cabo_token KULLANMIYORUZ, ama varsa idempotent silinir.
 */

const isProd = process.env.NODE_ENV === "production";
const SECURE = isProd ? " Secure;" : "";

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
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
    );
  }

  try {
    // 2) CSRF
    await validateCsrfToken(req);

    // 3) Opsiyonel: mevcut oturum
    const session = await getServerSession(authOptions);

    const res = NextResponse.json({ success: true }, { status: 200 });

    // 4) NextAuth cookie isimleri (prod/dev varyasyonları)
    const cookieNames = [
      "__Secure-next-auth.session-token",
      "next-auth.session-token",
      "__Secure-next-auth.callback-url",
      "next-auth.callback-url",
      "__Secure-next-auth.csrf-token",
      "next-auth.csrf-token",
      // Legacy: varsa temizle (custom kullanılmıyor artık)
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
    return NextResponse.json({ error: "Logout failed" }, { status: 400 });
  }
}
