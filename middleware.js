import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// SECURITY REVIEW: This middleware currently does NOT enforce CSRF protection globally.
// For production, consider adding CSRF validation for all state-changing requests (POST, PUT, PATCH, DELETE),
// or ensure that every sensitive API route implements CSRF checks individually (as in your current approach).
// Relying only on per-route CSRF can lead to accidental omissions. Centralized enforcement is more robust.

export function middleware(req) {
  const token = req.cookies.get('cabo_token')?.value;
  const { pathname } = req.nextUrl;

  // Eğer token yoksa → login sayfasına yönlendir
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = decoded.role;

    // 🔐 Merchant route'lar sadece merchant rolüne açık
    if (pathname.startsWith('/merchant')) {
      if (role !== 'merchant') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    // 🔐 Kullanıcı route'lar sadece affiliate rolüne açık
    const userRoutes = [
      '/dashboard',
      '/wallet',
      '/mylinks',
      '/performance',
      '/settings'
    ];
    if (userRoutes.some((r) => pathname.startsWith(r))) {
      if (role !== 'affiliate') {
        return NextResponse.redirect(new URL('/merchant/dashboard', req.url));
      }
    }

  } catch (err) {
    console.error("JWT verification failed in middleware:", err);
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // SECURITY REVIEW: No CSRF validation is performed here. If you want to enforce CSRF for all protected routes,
  // you could integrate CSRF token validation here, or at least log/monitor requests missing CSRF tokens.

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/wallet/:path*',
    '/mylinks/:path*',
    '/performance/:path*',
    '/settings/:path*',
    '/merchant/:path*',
  ],
};
// SECURITY REVIEW: Ensure that all sensitive API endpoints (especially those under /api) are protected by CSRF validation.
// If you add new endpoints, remember to include CSRF protection.
