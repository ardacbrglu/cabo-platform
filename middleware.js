import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

function getTokenFromCookies(req) {
  return (
    req.cookies.get('cabo_token')?.value ||
    req.cookies.get('next-auth.session-token')?.value ||
    req.cookies.get('__Secure-next-auth.session-token')?.value
  );
}

export function middleware(req) {
  const token = getTokenFromCookies(req);
  const { pathname } = req.nextUrl;

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role;

    if (pathname.startsWith('/merchant')) {
      if (role !== 'merchant') {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    }

    const userRoutes = [
      '/dashboard',
      '/wallet',
      '/mylinks',
      '/products',
      '/performance',
      '/settings',
      '/support',
      '/notifications',
    ];
    if (userRoutes.some((r) => pathname.startsWith(r))) {
      if (role !== 'affiliate') {
        return NextResponse.redirect(new URL('/login', req.url));
      }
    }
  } catch (err) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/wallet/:path*',
    '/mylinks/:path*',
    '/products/:path*',
    '/performance/:path*',
    '/settings/:path*',
    '/support/:path*',
    '/notifications/:path*',
    '/merchant/:path*',
  ],
};
