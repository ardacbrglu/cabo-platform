// middleware.js  (TS YOK, düz JS)
// NextAuth v5 ile çalışır. Role kontrolü token'dan yapılır.
import { withAuth } from "next-auth/middleware";

const AFFILIATE_PREFIXES = [
  "/dashboard",
  "/products",
  "/mylinks",
  "/performance",
  "/wallet",
  "/settings",
];

const MERCHANT_PREFIX = "/merchant";

export default withAuth({
  pages: { signIn: "/login" },

  callbacks: {
    authorized: ({ token, req }) => {
      // token yoksa login'e
      if (!token) return false;

      const p = req.nextUrl.pathname || "";

      // Merchant alanı
      if (p.startsWith(MERCHANT_PREFIX)) {
        return token.role === "merchant" || token.role === "admin";
      }

      // Affiliate alanları
      if (AFFILIATE_PREFIXES.some((pre) => p === pre || p.startsWith(pre + "/"))) {
        return token.role === "affiliate" || token.role === "admin";
      }

      // Diğer sayfalar herkese açık
      return true;
    },
  },
});

// Sadece korumak istediklerimizi yakala:
export const config = {
  matcher: [
    // affiliate alanları
    "/dashboard",
    "/products/:path*",
    "/mylinks/:path*",
    "/performance/:path*",
    "/wallet/:path*",
    "/settings/:path*",

    // merchant alanları
    "/merchant/:path*",
  ],
};
