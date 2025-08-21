/**
 * File: /middleware.js
 * Purpose: Korumalı sayfalar için oturum ve rol kapıları + ortak güvenlik başlıkları.
 * Security:
 * - NextAuth token kontrolü (withAuth)
 * - Kullanıcı status === "active" şartı
 * - RBAC: affiliate ↔ merchant alanları
 * - Güvenlik başlıkları + Request-Id
 */

import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

// Korunacak alanlar
const AFFILIATE_AREAS = ["/dashboard", "/wallet", "/my-links", "/performance"];
const MERCHANT_AREAS  = ["/merchant"];

export const config = {
  matcher: [
    ...AFFILIATE_AREAS.map((p) => `${p}/:path*`),
    ...MERCHANT_AREAS.map((p) => `${p}/:path*`),
    // Ürünler de login isterse aç:
    // "/products/:path*",
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

function pathStartsWith(path, prefixes) {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

export default withAuth(
  function middleware(req) {
    const { nextUrl } = req;
    const token = req.nextauth?.token; // withAuth → getToken()

    // 1) Oturum zorunlu
    if (!token) {
      const login = new URL("/login", nextUrl.origin);
      login.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
      return applyCommonHeaders(NextResponse.redirect(login));
    }

    // 2) Hesap aktif mi?
    const status = token.status ?? "active";
    if (status !== "active") {
      const activate = new URL("/activate", nextUrl.origin);
      activate.searchParams.set("notice", "activate_account");
      return applyCommonHeaders(NextResponse.redirect(activate));
    }

    // 3) Rol kapıları
    const role = token.role || "affiliate";
    const path = nextUrl.pathname;

    if (pathStartsWith(path, AFFILIATE_AREAS) && role !== "affiliate") {
      return applyCommonHeaders(NextResponse.redirect(new URL("/merchant/dashboard", nextUrl.origin)));
    }
    if (pathStartsWith(path, MERCHANT_AREAS) && role !== "merchant") {
      return applyCommonHeaders(NextResponse.redirect(new URL("/dashboard", nextUrl.origin)));
    }

    // 4) Geçiş
    return applyCommonHeaders(NextResponse.next());
  },
  {
    // Redirect’leri biz yönetiyoruz; token’ı burada zorlamıyoruz.
    callbacks: { authorized: () => true },
  }
);
