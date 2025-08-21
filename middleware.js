// /middleware.js
/**
 * Purpose: Korumalı sayfalar için oturum/rol kapıları + ortak güvenlik başlıkları.
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
    // Merchant alanları
    "/merchant/:path*",
  ],
};

function applyCommonHeaders(res) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
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
    const token = req.nextauth?.token; // withAuth → getToken

    // 1) Oturum zorunlu
    if (!token) {
      const login = new URL("/login", nextUrl.origin);
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

    return applyCommonHeaders(NextResponse.next());
  },
  { callbacks: { authorized: () => true } }
);
