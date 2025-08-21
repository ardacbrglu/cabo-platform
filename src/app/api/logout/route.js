export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/logout/route.js
 * Purpose: Tüm kullanıcılar (affiliate/merchant) için idempotent logout.
 * Security Notes:
 * - Method: GET (CSRF gerekmez), fakat rate-limit uygulanır.
 * - Cookies: NextAuth oturum/CSRF/callback-url çerezlerinin __Secure/__Host varyantlarını da siler.
 * - Legacy: google_reg_precheck, csrf_token, cabo_token gibi eskileri de temizler.
 * - Headers: no-store + API security headers; Retry-After (RL aşıldıysa).
 * - Redirect: Varsayılan /login. Referer merchant alanıysa /merchant/login’a yönlendirir.
 */

import { NextResponse } from "next/server";
import { checkRateLimit, makeRateLimitKey } from "@/lib/ratelimit";
import { applyApiSecurityHeaders } from "@/lib/headers";
import { audit } from "@/lib/logger";

function withHeaders(res) {
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}

function guessLoginPath(req) {
  const referer = req.headers.get("referer") || "";
  try {
    const u = new URL(referer);
    if (u.pathname.startsWith("/merchant")) return "/merchant/login";
  } catch {}
  return "/login";
}

export async function GET(req) {
  const requestId =
    req.headers.get("x-request-id") ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()}`;

  try {
    // Hafif rate-limit (IP): 30/dk
    const rl = await checkRateLimit({
      key: makeRateLimitKey(req, { scope: "logout" }),
      limit: 30,
      windowMs: 60_000,
    });

    // Hedef login sayfasını belirle
    const loginPath = guessLoginPath(req);
    const redirectUrl = new URL(loginPath, req.url);

    const res = NextResponse.redirect(redirectUrl, 302);

    // Silinecek bilinen çerez isimleri (tüm varyantlar)
    const cookieNames = [
      // Session
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "__Host-next-auth.session-token",
      // CSRF
      "next-auth.csrf-token",
      "__Secure-next-auth.csrf-token",
      "__Host-next-auth.csrf-token",
      // Callback URL
      "next-auth.callback-url",
      "__Secure-next-auth.callback-url",
      "__Host-next-auth.callback-url",
      // Diğer NextAuth yardımcıları (zaman zaman görülebilir)
      "next-auth.state",
      "next-auth.pkce.code_verifier",
      // Legacy/yardımcı
      "google_reg_precheck",
      "csrf_token",
      "cabo_token",
    ];

    for (const name of cookieNames) {
      res.cookies.set({
        name,
        value: "",
        path: "/",
        httpOnly: true, // callback-url bazı dağıtımlarda httpOnly olmayabilir; burada agresif temizliyoruz.
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: new Date(0), // expire geçmişe
      });
    }

    if (!rl?.ok && rl?.resetMs) {
      res.headers.set("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
    }

    audit({ evt: "logout", requestId, from: loginPath.includes("merchant") ? "merchant" : "affiliate" });
    return withHeaders(res);
  } catch (e) {
    // Her durumda güvenli fallback
    const res = NextResponse.redirect(new URL("/login", req.url), 302);
    return withHeaders(res);
  }
}
