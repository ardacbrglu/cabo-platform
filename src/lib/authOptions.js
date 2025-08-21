/**
 * File: src/lib/authOptions.js
 * Purpose: NextAuth konfigürasyonu (Credentials + Google) — merkezi oturum yönetimi.
 * Security Notes:
 * - Google ilk kayıt: Yalnızca /api/register precheck (terms+captcha) sonrası verilen
 *   HttpOnly `google_reg_precheck` çerezi varsa yeni kullanıcı oluşturulur.
 * - Credentials authorize: email+password doğrulaması + status === 'active' kontrolü (callback suistimali önler).
 * - Session: session nesnesine id/role/status eklenir (RBAC ve status kapıları için).
 * - Adapter: Prisma; Session strategy 'database' (schema mevcut).
 */

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function pickUserShape(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name || "",
    email: u.email,
    role: u.role,
    status: u.status,
    image: u.image || null,
  };
}

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 gün
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = String(credentials?.email || "").trim().toLowerCase();
          const password = String(credentials?.password || "");
          if (!email || !password) return null;

          const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, passwordHash: true, role: true, status: true, name: true },
          });
          if (!user) return null;
          if (user.status !== "active") return null;
          if (!user.passwordHash) return null;

          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;

          return pickUserShape(user);
        } catch {
          return null;
        }
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  callbacks: {
    // Google: precheck olmadan yeni hesap oluşturulmasın
    async signIn({ user, account, profile, email, credentials, req }) {
      if (account?.provider !== "google") return true;

      const emailLower = (user?.email || "").toLowerCase();
      if (!emailLower) return false;

      const existing = await prisma.user.findUnique({ where: { email: emailLower } });
      if (existing) {
        // Mevcut kullanıcı login — yalnız aktifse girişe izin ver
        return existing.status === "active";
      }

      // Yeni kullanıcı oluşturulacaksa precheck cookie zorunlu
      try {
        const cookieHeader =
          req?.headers?.get?.("cookie") ||
          ""; // App Router'da callback içinden header okuyabiliyoruz
        const match = cookieHeader.match(/(?:^|;\s*)google_reg_precheck=([^;]+)/i);
        const token = match ? decodeURIComponent(match[1]) : null;
        if (!token) return false;

        jwt.verify(token, process.env.NEXTAUTH_SECRET); // süre ve imza kontrolü
        return true;
      } catch {
        return false;
      }
    },
    async jwt({ token, user }) {
      // İlk girişte user bilgilerini JWT'ye koy
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.name = user.name || "";
      } else {
        // Veritabanındaki güncel role/status'u izlemek için (opsiyonel masraf)
        // İstersen bu kısmı kapatabilirsin.
        if (token?.email) {
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
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.status = token.status;
      session.user.name = token.name || session.user.name || "";
      return session;
    },
  },
  events: {
    // Google ile ilk kez oluşan kullanıcıyı finalize et
    async createUser({ user }) {
      try {
        // Eğer Google ile geldiyse ve manuel parola yoksa:
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
  // pages: { signIn: "/login" }, // custom route kullanıyorsak açabiliriz
  secret: process.env.NEXTAUTH_SECRET,
};
