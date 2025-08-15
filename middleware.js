// src/middleware.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Korunacak path’ler — ihtiyacına göre ekle/çıkar
const PROTECTED = [
  "/dashboard",
  "/products",
  "/mylinks",
  "/performance",
  "/wallet",
  "/settings",
  "/support",
  "/notifications",
  "/merchant",              // merchant alanı da login istiyorsa
];

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  // Bu istek authenticated mi?
  const isLoggedIn = !!req.auth?.user;

  // Protected path mi?
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  // Login değilse ve protected bir sayfaysa → /login’e yönlendir
  if (!isLoggedIn && isProtected) {
    const url = nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", path + nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Aksi halde devam
  return NextResponse.next();
});

// Sadece sayfa rotalarına çalışsın; _next, statikler ve API hariç
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|images/|api/).*)",
  ],
};
