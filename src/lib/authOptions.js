// src/lib/authOptions.js
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function shapeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name || "",
    email: u.email,
    role: u.role || "affiliate",
    status: u.status || "active",
    image: u.image || null,
  };
}

export const authOptions = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,

  // Stateless session, Railway gibi ortamlarda problemsiz
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        try {
          const email = String(credentials?.email || "").trim().toLowerCase();
          const password = String(credentials?.password || "");
          if (!email || !password) return null;

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              passwordHash: true,
              role: true,
              status: true,
              name: true,
              image: true,
              accounts: { select: { provider: true }, take: 1 },
            },
          });
          if (!user) return null;

          // Google-only hesapları burada engelle
          const isGoogleOnly = !user.passwordHash && (user.accounts || []).some(a => a.provider === "google");
          if (isGoogleOnly) return null;

          // RBAC + status
          if (user.role !== "affiliate") return null;
          if (user.status !== "active") return null;

          const ok = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
          if (!ok) return null;

          return shapeUser(user);
        } catch {
          return null;
        }
      },
    }),

    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
  ],

  pages: { signIn: "/login" },

  callbacks: {
    // Google signup için precheck (opsiyonel ama güvenli)
    async signIn({ user, account, req }) {
      if (account?.provider !== "google") return true;

      const emailLower = (user?.email || "").toLowerCase();
      if (!emailLower) return false;

      const existing = await prisma.user.findUnique({ where: { email: emailLower } });
      if (existing) {
        return existing.status === "active";
      }

      // Yeni kullanıcı açılacaksa precheck cookie kontrolü (opsiyonel)
      try {
        const cookieHeader = req?.headers?.get?.("cookie") || "";
        const match = cookieHeader.match(/(?:^|;\s*)google_reg_precheck=([^;]+)/i);
        const token = match ? decodeURIComponent(match[1]) : null;
        if (!token) return false;
        jwt.verify(token, process.env.NEXTAUTH_SECRET); // süre + imza kontrolü
        return true;
      } catch {
        return false;
      }
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.name = user.name || "";
        token.email = user.email || token.email;
      }
      return token;
    },

    async session({ session, token }) {
      session.user = session.user || {};
      session.user.id = token.id || session.user.id;
      session.user.role = token.role || session.user.role;
      session.user.status = token.status || session.user.status;
      session.user.name = token.name || session.user.name || "";
      session.user.email = token.email || session.user.email || "";
      return session;
    },

    // callbackUrl’i koru; loop/bozuk yönlendirme olmasın
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);
        // sadece aynı origin’e izin ver
        if (u.origin === baseUrl) return u.toString();
        return baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },

  events: {
    async createUser({ user }) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            role: "affiliate",
            status: "active",
            termsAccepted: true,
            languagePreference: "en",
            currencyCode: "TRY",
            activationToken: null,
            activationRequestedCount: 0,
            lastActivationRequestAt: null,
          },
        });
      } catch {}
    },
  },
};
