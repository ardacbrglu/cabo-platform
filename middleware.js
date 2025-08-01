// middleware.js

import { NextResponse } from 'next/server'

export function middleware(req) {
  const token = req.cookies.get('cabo_token')?.value
  const { pathname } = req.nextUrl

  // which top-level app routes to protect
  const protectedRoutes = [
    '/dashboard',
    '/wallet',
    '/mylinks',
    '/performance',
    '/settings',
  ]

  // if the request path starts with one of those, but no token → /login
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
