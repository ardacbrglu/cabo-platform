import { NextResponse } from 'next/server'

export function middleware(req) {
  const token = req.cookies.get('cabo_token')?.value
  const { pathname } = req.nextUrl

  // Korumalı route listesi
  const protectedRoutes = [
    '/dashboard',
    '/wallet',
    '/mylinks',
    '/performance',
    '/settings',
  ]

  // Korumalı route'a erişim ve token yoksa login'e at
  if (
    protectedRoutes.some((p) => pathname.startsWith(p)) &&
    !token
  ) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/wallet/:path*',
    '/mylinks/:path*',
    '/performance/:path*',
    '/settings/:path*',
  ],
}
