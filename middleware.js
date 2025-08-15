// src/middleware.js
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

/**
 * SECURITY NOTES
 * - NextAuth JWT içindeki role/status alanlarına göre erişim kontrolü.
 * - Sadece matcher'daki korumalı sayfalar yakalanır (API/public varlıklara dokunulmaz).
 * - Custom JWT/cookie yok; sadece NextAuth session.
 */

const USER_ROUTES = [
  "/dashboard",
  "/wallet",
  "/mylinks",
  "/products",
  "/performance",
  "/settings",
  "/support",
  "/notifications",
];

export default withAuth(
  function middleware(req) {
    const { pathname, search } = req.nextUrl;
    const token = req.nextauth?.token || null;
    const role = token?.role ? String(token.role) : undefined;
    const status = token?.status ? String(token.status) : undefined;

    const isUserArea = USER_ROUTES.some((r) => pathname.startsWith(r));
    const isMerchantArea = pathname.startsWith("/merchant");
    const isProtected = isUserArea || isMerchantArea;

    if (!token && isProtected) {
      const url = new URL("/login", req.url);
      if (pathname && pathname !== "/login") url.searchParams.set("from", pathname + (search || ""));
      return NextResponse.redirect(url);
    }

    if (isProtected && status !== "active") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (isMerchantArea && role !== "merchant" && role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (isUserArea && role !== "affiliate" && role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: () => true, // token çözülür; yönlendirme içeride
    },
  }
);

// Yalnız sayfa yönleri (API/public hariç)
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/wallet/:path*",
    "/mylinks/:path*",
    "/products/:path*",
    "/performance/:path*",
    "/settings/:path*",
    "/support/:path*",
    "/notifications/:path*",
    "/merchant/:path*",
  ],
};
