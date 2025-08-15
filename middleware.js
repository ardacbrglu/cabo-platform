// /src/middleware.js
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function middleware(req) {
  const url = req.nextUrl;
  const path = url.pathname;

  const session = await auth(); // NextAuth v5
  const role = session?.user?.role;
  const loggedIn = !!session;

  // Merchant bölgesi
  if (path.startsWith("/merchant")) {
    if (!loggedIn) return NextResponse.redirect(new URL("/login", url));
    if (role !== "merchant" && role !== "admin") {
      return NextResponse.redirect(new URL("/", url));
    }
    return NextResponse.next();
  }

  // Affiliate sayfaları
  const affPaths = new Set([
    "/dashboard",
    "/mylinks",
    "/performance",
    "/wallet",
  ]);
  if (affPaths.has(path)) {
    if (!loggedIn) return NextResponse.redirect(new URL("/login", url));
    if (role !== "affiliate" && role !== "admin") {
      return NextResponse.redirect(new URL("/", url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/mylinks",
    "/performance",
    "/wallet",
    "/merchant/:path*",
  ],
};
