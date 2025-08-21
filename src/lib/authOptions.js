/**
 * File: src/lib/authOptions.js
 * Purpose: NextAuth konfigürasyonu (Credentials + Google) — merkezi oturum yönetimi.
 * Security Notes:
 * - Google ilk kayıt: /api/register precheck sonrası verilen HttpOnly `google_reg_precheck`
 *   çerezi varsa yeni kullanıcı açılır (signIn callback’inde doğrulanır).
 * - Credentials authorize: email+password + role === 'affiliate' + status === 'active'.
 * - Session: database strategy; session nesnesine id/role/status yazılır.
 * - Adapter: Prisma.
 */

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function shapeUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name || "", email: u.email, role: u.role, status: u.status, image: u.image || null };
}

export const authOptions = {
  trustHost: true, // proxy/edge arkasında host güveni
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET, // tek SECRET!

  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 gün
  },

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
            select: { id: true, email: true, passwordHash: true, role: true, status: true, name: true, accounts: { select: { provider: true }, take: 1 } },
          });
          if (!user) return null;

          // Google-only hesap burada reddedilsin (şifre yoksa)
          const isGoogleOnly = !user.passwordHash && (user.accounts || []).some((a) => a.provider === "google");
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

    // Google oturum (opsiyonel)
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

  pages: {
    signIn: "/login",
    // error: "/login",
  },

  callbacks: {
    // Google: precheck olmadan YENİ hesap oluşmasın
    async signIn({ user, account, req }) {
      if (account?.provider !== "google") return true;

      const emailLower = (user?.email || "").toLowerCase();
      if (!emailLower) return false;

      const existing = await prisma.user.findUnique({ where: { email: emailLower } });
      if (existing) {
        // Mevcut kullanıcı — yalnız aktifse izin ver
        return existing.status === "active";
      }

      // Yeni hesap açılacaksa precheck cookie zorunlu
      try {
        const cookieHeader = req?.headers?.get?.("cookie") || "";
        const match = cookieHeader.match(/(?:^|;\s*)google_reg_precheck=([^;]+)/i);
        const token = match ? decodeURIComponent(match[1]) : null;
        if (!token) return false;

        jwt.verify(token, process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET); // süre + imza
        return true;
      } catch {
        return false;
      }
    },

    async jwt({ token, user }) {
      // İlk girişte user bilgilerini token'a yaz
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.name = user.name || "";
      } else {
        // (Opsiyonel) her istek DB’den role/status güncelle
        if (token?.email && process.env.AUTH_REFRESH_USER_FROM_DB === "1") {
          try {
            const u = await prisma.user.findUnique({
              where: { email: token.email.toLowerCase() },
              select: { id: true, role: true, status: true, name: true },
            });
            if (u) {
              token.id = u.id;
              token.role = u.role;
              token.status = u.status;
              token.name = u.name || "";
            }
          } catch {}
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user = session.user || {};
      session.user.id = token.id || session.user.id;
      session.user.role = token.role || session.user.role;
      session.user.status = token.status || session.user.status;
      session.user.name = token.name || session.user.name || "";
      return session;
    },
  },

  events: {
    // Google ile ilk oluşturulan kullanıcıyı finalize et (varsayılanlar)
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
