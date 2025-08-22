export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * File: src/app/api/logout/route.js
 * Purpose: Tüm kullanıcılar (affiliate/merchant) için idempotent logout.
 *
 * Security Docblock:
 * - Method: GET/HEAD (CSRF gereksiz), fakat 30/dk IP rate-limit uygulanır.
 * - Cookies: NextAuth oturum/CSRF/callback-url çerezlerinin __Secure/__Host varyantlarını da siler.
 * - Legacy: google_reg_precheck, csrf_token, cabo_token gibi eskileri de temizler.
 * - Headers: no-store + güvenli başlıklar; Retry-After (RL aşıldıysa).
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

function nukeCookies(res) {
  const names = [
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
    // OAuth helpers
    "next-auth.state",
    "next-auth.pkce.code_verifier",
    // Legacy
    "google_reg_precheck",
    "csrf_token",
    "cabo_token",
  ];

  for (const name of names) {
    res.cookies.set({
      name,
      value: "",
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(0),
    });
  }
}

export async function GET(req) {
  const requestId =
    req.headers.get("x-request-id") ||
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random()}`;

  try {
    const rl = await checkRateLimit({
      key: makeRateLimitKey(req, { scope: "logout" }),
      limit: 30,
      windowMs: 60_000,
    });

    const loginPath = guessLoginPath(req);
    const redirectUrl = new URL(loginPath, req.url);
    const res = NextResponse.redirect(redirectUrl, 302);

    nukeCookies(res);

    if (!rl?.ok && rl?.resetMs) {
      res.headers.set("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
    }

    audit({ evt: "logout", requestId, to: loginPath });
    return withHeaders(res);
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url), 302);
    nukeCookies(res);
    return withHeaders(res);
  }
}

export async function HEAD(req) {
  // Bazı tarayıcı/önbellek aracıları HEAD atabilir; aynı davranışı uygula
  return GET(req);
}
