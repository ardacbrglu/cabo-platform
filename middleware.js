/**
 * File: /middleware.js
 * Purpose: Korumalı sayfalar için oturum ve rol kapıları + ortak güvenlik başlıkları.
 * Security Notes:
 * - Auth: NextAuth middleware (withAuth) üzerinden token okunur.
 * - Status: Yalnızca status === "active" kullanıcılar korumalı alanlara girer.
 * - RBAC: Affiliate alanları ↔ merchant alanları arasında rol tabanlı yönlendirme.
 * - Headers: nosniff, strict-origin-when-cross-origin, COOP/CORP, HSTS (prod).
 * - Request-Id: Yoksa üretip yanıta ekler (korelasyon için).
 */

import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/products/:path*",
    "/mylinks/:path*",
    "/performance/:path*",
    "/wallet/:path*",
    "/merchant/:path*",
  ],
};

function applyCommonHeaders(res) {
  // Güvenlik başlıkları
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  // Request-Id (yoksa üret)
  if (!res.headers.get("X-Request-Id")) {
    const rid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    res.headers.set("X-Request-Id", rid);
  }
  return res;
}

export default withAuth(
  function middleware(req) {
    const { nextUrl } = req;
    const token = req.nextauth?.token; // withAuth → getToken

    // 1) Oturum yoksa → /login?callbackUrl=...
    if (!token) {
      const login = new URL("/login", nextUrl.origin);
      login.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
      return applyCommonHeaders(NextResponse.redirect(login));
    }

    // 2) Kullanıcı aktif mi?
    const status = token.status;
    if (status && status !== "active") {
      const activate = new URL("/activate", nextUrl.origin);
      activate.searchParams.set("notice", "activate_account");
      return applyCommonHeaders(NextResponse.redirect(activate));
    }

    // 3) Rol kapıları (affiliates vs merchants)
    const path = nextUrl.pathname;
    const isAffiliateArea = /^\/(dashboard|products|mylinks|performance|wallet)(\/|$)/.test(path);
    const isMerchantArea = /^\/merchant(\/|$)/.test(path);
    const role = token.role;

    if (isAffiliateArea && role !== "affiliate") {
      return applyCommonHeaders(NextResponse.redirect(new URL("/merchant/dashboard", nextUrl.origin)));
    }
    if (isMerchantArea && role !== "merchant") {
      return applyCommonHeaders(NextResponse.redirect(new URL("/dashboard", nextUrl.origin)));
    }

    // 4) Geçiş
    return applyCommonHeaders(NextResponse.next());
  },
  {
    // Redirect mantığını biz yönettiğimiz için, yetkilendirmeyi burada hep true bırakıyoruz.
    callbacks: { authorized: () => true },
  }
);
