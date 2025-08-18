// /src/lib/authOptions.js
/**
 * SECURITY NOTES
 * - Session: JWT strategy; role/status token’a eklenir.
 * - Credentials authorize: sadece email+şifre doğrular, role ayrımı yapmaz;
 *   status 'active' ve lock kontrolü vardır. (Merchant ve affiliate ortak doğrulama)
 * - Google: Sadece affiliate için; merchant için Google girişine izin verilmez.
 * - Google registration: precheck cookie (google_reg_precheck) zorunlu; yoksa yeni user oluşturulmaz.
 */

import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const isProd = process.env.NODE_ENV === "production";

// Prod’da runtime’da bulunması zorunlu; build anında yoksa yalnızca uyarı veriyoruz.
const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET || (!isProd ? "dev-nextauth-secret" : undefined);
if (isProd && !process.env.NEXTAUTH_SECRET) {
  console.warn("[auth] NEXTAUTH_SECRET missing at build (ok); must be set at runtime.");
}

// JWT secret: yoksa NEXTAUTH_SECRET’e, o da yoksa dev fallback’e düş
const JWT_SECRET = process.env.JWT_SECRET || NEXTAUTH_SECRET || "dev-jwt-secret";

// Google provider var mı?
const HAS_GOOGLE = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
if (isProd && !HAS_GOOGLE) {
  console.warn("[auth] Google OAuth envs missing at build (ok); add at runtime if you use Google.");
}

function verifyGooglePrecheckCookie() {
  try {
    const c = cookies().get("google_reg_precheck")?.value;
    if (!c) return false;
    const payload = jwt.verify(c, JWT_SECRET);
    return payload && payload.scope === "google_registration_precheck";
  } catch {
    return false;
  }
}

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  pages: { signIn: "/login" },

  providers: [
    // Credentials: merchant + affiliate ortak doğrulama (RBAC/status kapıları proxy rotalarda)
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password || "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Google-only hesaplar (password yok) credentials ile giremez
        if (!user.passwordHash) return null;

        // Hesap geçici kilitliyse reddet (lock enforcement)
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) return null;

        // Şifre doğrulama (sayaç güncelleme proxy rotalarda yapılır)
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Aktif olmayan hesaplar reddedilir; pending uyarısı proxy rotalarda gösterilir
        if (user.status !== "active") return null;

        // Role ayrımı burada yapılmaz; proxy rotalar ( /api/login , /api/merchant_login ) RBAC’ı yönetir
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        };
      },
    }),

    // Google: sadece env varsa eklenir. Merchant için signIn callback’te engellenir.
    ...(HAS_GOOGLE
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = String(user.id);
        token.email = user.email;
        if (user.role) token.role = user.role;
        if (user.status) token.status = user.status;
      }
      // Eksikse DB’den tamamla
      if (!token.role || !token.status) {
        try {
          const u = await prisma.user.findUnique({
            where: { email: (token.email || user?.email || "").toLowerCase() },
            select: { id: true, role: true, status: true },
          });
          if (u) {
            token.sub = String(u.id);
            token.role = u.role;
            token.status = u.status;
          }
        } catch {}
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = String(token.sub);
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },

    async signIn({ user, account }) {
      // Merchant için Google login yasak
      if (account?.provider === "google") {
        const email = user?.email?.toLowerCase?.();
        if (!email) return false;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing?.role === "merchant") return false;

        // Yeni affiliate kaydı: precheck cookie zorunlu
        if (!existing) {
          const ok = verifyGooglePrecheckCookie();
          return !!ok;
        }
        // Var olan kullanıcı aktif olmalı
        return existing.status === "active";
      }
      // Credentials tarafında ek kural yok; RBAC/status/lock mesajlarını proxy rotalar verir
      return true;
    },
  },

  events: {
    // Google ile yeni user yaratıldıysa affiliate olarak stabilize et
    async createUser({ user, account }) {
      if (account?.provider === "google" && user?.email) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              status: "active",
              role: "affiliate",
              termsAccepted: true,
              emailVerified: user.emailVerified ?? new Date(),
            },
          });
        } catch {}
      }
    },
  },

  // Prod’da runtime’da set edilmesi şart; dev’de fallback geliyor
  secret: NEXTAUTH_SECRET,
};
