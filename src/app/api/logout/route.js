// app/api/logout/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey, logApiEvent } from "@/lib/ratelimit";

const isProd = process.env.NODE_ENV === "production";
const SECURE = isProd ? " Secure;" : "";

/**
 * SECURITY NOTES:
 * - Sadece POST kabul edilir (CSRF zorunlu).
 * - NextAuth JWT stratejisinde "session-token" cookie’sini temizlemek yeterlidir.
 * - Olası tüm NextAuth cookie isimleri (secure prefix’li ve prefix’siz) temizlenir.
 * - Eski sistemden kalma cabo_token da idempotent olarak temizlenir.
 */
export async function POST(req) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]
    || req.headers.get("x-real-ip")
    || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  // 1) Rate limit (logout abuse’u engelle)
  const rlKey = makeRateLimitKey(req, { scope: "logout" });
  const { ok, resetMs } = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  if (!ok) {
    await logApiEvent({ endpoint: "logout", ip, ua, event: "ratelimit" });
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
    );
  }

  try {
    // 2) CSRF doğrulaması
    await validateCsrfToken(req);

    // 3) Session kontrolü (opsiyonel; yoksa da cookie’leri temizleriz)
    const session = await getServerSession(authOptions);

    const res = NextResponse.json({ success: true }, { status: 200 });

    // 4) NextAuth’un oluşturabileceği tüm cookie adlarını temizle
    //    (Secure prefix’li adlar prod’da, prefix’siz adlar dev’de görülür.)
    const cookieNames = [
      "__Secure-next-auth.session-token",
      "next-auth.session-token",
      "__Secure-next-auth.callback-url",
      "next-auth.callback-url",
      "__Secure-next-auth.csrf-token",
      "next-auth.csrf-token",
      // Legacy/örnek: eski sistemden kalan özel cookie
      "cabo_token",
    ];

    // HttpOnly; Path=/; Max-Age=0; SameSite=Lax (NextAuth default); Secure (prod)
    for (const name of cookieNames) {
      res.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${SECURE}`
      );
    }

    // Not: Uygulamanın kendi CSRF cookie’si (csrf_token) SİLİNMEZ.
    // Çünkü sayfada kalıp başka form işlemlerine devam edebilir; gerekirse client refresh’te yenilenir.

    await logApiEvent({
      endpoint: "logout",
      ip,
      ua,
      event: session ? "ok" : "ok_no_session",
      email: session?.user?.email || null,
    });

    return res;
  } catch (err) {
    await logApiEvent({ endpoint: "logout", ip, ua, event: "error", error: err?.message || String(err) });
    // Hata mesajını genelleyelim
    return NextResponse.json({ error: "Logout failed" }, { status: 400 });
  }
}

// Güvenlik gereği GET ile logout yapılmaz.
// export const GET = POST; // ← BUNU KULLANMIYORUZ
