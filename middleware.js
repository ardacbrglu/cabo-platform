// src/middleware.js
/**
 * Purpose: Korumalı sayfalar için oturum/rol kapıları + ortak güvenlik başlıkları (Cabo PROD).
 *
 * Security Docblock:
 * - Sadece korumalı yol desenlerinde çalışır (login/register hariç).
 * - NextAuth withAuth ile token okunur; status 'active' ve uygun rol zorunlu.
 * - Güvenlik başlıkları: nosniff, referrer-policy, COOP (allow-popups), CORP, X-Frame-Options, HSTS(prod).
 * - X-Request-Id: Yoksa üret ve response’a koy (edge->api zinciri için).
 * - Bu middleware **CSP set etmez**; CSP API cevaplarında lib/headers ile verilir (çift header engeli).
 */
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

export const config = {
  matcher: [
    // Affiliate alanları
    "/dashboard/:path*",
    "/products/:path*",
    "/mylinks/:path*",
    "/performance/:path*",
    "/wallet/:path*",
    // Merchant: sadece korumalı sekmeler (login/register dışarıda!)
    "/merchant/dashboard/:path*",
    "/merchant/payments/:path*",
    "/merchant/integrate/:path*",
    "/merchant/support/:path*",
  ],
};

function applyCommonHeaders(res) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Google/OAuth popupları için allow-popups gerekir
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("X-Frame-Options", "DENY");
  // Minimal Permissions-Policy (gerekirse genişletilebilir)
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  if (!res.headers.get("X-Request-Id")) {
    const rid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    res.headers.set("X-Request-Id", rid);
  }
  return res;
}

export default withAuth(
  function middleware(req) {
    const { nextUrl } = req;
    const token = req.nextauth?.token;

    const path = nextUrl.pathname;
    const isMerchantArea = /^\/merchant(\/|$)/.test(path);

    // 1) Oturum zorunlu
    if (!token) {
      const loginPath = isMerchantArea ? "/merchant/login" : "/login";
      const login = new URL(loginPath, nextUrl.origin);
      login.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
      return applyCommonHeaders(NextResponse.redirect(login));
    }

    // 2) Yalnızca aktif kullanıcı
    if (token.status && token.status !== "active") {
      const activate = new URL("/activate", nextUrl.origin);
      activate.searchParams.set("notice", "activate_account");
      return applyCommonHeaders(NextResponse.redirect(activate));
    }

    // 3) RBAC
    const isAffiliateArea = /^\/(dashboard|products|mylinks|performance|wallet)(\/|$)/.test(path);
    const role = token.role;

    if (isAffiliateArea && role !== "affiliate") {
      return applyCommonHeaders(NextResponse.redirect(new URL("/merchant/dashboard", nextUrl.origin)));
    }
    if (isMerchantArea && role !== "merchant") {
      return applyCommonHeaders(NextResponse.redirect(new URL("/dashboard", nextUrl.origin)));
    }

    return applyCommonHeaders(NextResponse.next());
  },
  { callbacks: { authorized: () => true } }
);
