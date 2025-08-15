// /middleware.js
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Sadece korumak istediklerimizi eşleştiriyoruz
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

export default auth(async (req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const s = req.auth; // next-auth middleware'den gelir

  // Giriş yoksa login'e
  if (!s?.user) {
    const login = new URL("/login", nextUrl.origin);
    login.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(login);
  }

  const role = s.user.role;

  const isAffiliateArea = /^\/(dashboard|products|mylinks|performance|wallet)(\/|$)/.test(path);
  const isMerchantArea = /^\/merchant(\/|$)/.test(path);

  // Yanlış rolde ise doğru alana gönder
  if (isAffiliateArea && role !== "affiliate") {
    return NextResponse.redirect(new URL("/merchant/dashboard", nextUrl.origin));
  }
  if (isMerchantArea && role !== "merchant") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
  }

  return NextResponse.next();
});
