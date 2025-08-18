export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";

/**
 * SECURITY NOTES
 * - GET /logout idempotent: NextAuth ve legacy cookie’leri siler ve /login’a yönlendirir.
 * - CSRF: GET olduğu için gerekmez. Rate-limit uygulanır.
 * - Cookie isimleri: __Secure-next-auth.session-token, __Host-next-auth.csrf-token,
 *   __Secure-next-auth.callback-url, csrf_token, (varsa) cabo_token.
 */
export async function GET(req) {
  try {
    // Hafif rate-limit (IP)
    const rl = await checkRateLimit({
      key: makeRateLimitKey(req, { scope: "logout" }),
      limit: 30,
      windowMs: 60_000,
    });
    // RL aşılırsa bile logout güvenli/idempotent; sadece Retry-After set edelim.
    const redirectUrl = new URL("/login", req.url);
    const res = NextResponse.redirect(redirectUrl, rl?.ok ? 302 : 302);

    const cookieNames = [
      "__Secure-next-auth.session-token",
      "__Host-next-auth.csrf-token",
      "__Secure-next-auth.callback-url",
      "csrf_token",
      "cabo_token", // legacy varsa
    ];

    for (const name of cookieNames) {
      res.cookies.set({
        name,
        value: "",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        expires: new Date(0), // sil
      });
    }

    res.headers.set("Cache-Control", "no-store");
    if (!rl?.ok && rl?.resetMs) {
      res.headers.set("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
    }
    return res;
  } catch {
    // Her durumda güvenli fallback
    return NextResponse.redirect(new URL("/login", req.url));
  }
}
