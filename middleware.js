// /middleware.js
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

// Kullanıcı (affiliate) alanları
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
    const { pathname } = req.nextUrl;
    const token = req.nextauth?.token || null;
    const role = token && token.role ? String(token.role) : undefined;
    const status = token && token.status ? String(token.status) : undefined;

    const isUserArea = USER_ROUTES.some((r) => pathname.startsWith(r));
    const isMerchantArea = pathname.startsWith("/merchant");
    const isProtected = isUserArea || isMerchantArea;

    // Oturumu olmayanı login'e at
    if (!token && isProtected) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Hesap aktif değilse (pending vs.) korumalı alanlara sokma
    if (isProtected && status !== "active") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Rol kapıları
    if (isMerchantArea && role !== "merchant" && role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (isUserArea && role !== "affiliate" && role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  },
  {
    // authorized=true -> middleware her zaman çalışsın; yönlendirmeyi içeride yapıyoruz.
    callbacks: {
      authorized: () => true,
    },
  }
);

// Yalnızca korumalı yolları yakala (public asset/api'lere dokunma)
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
