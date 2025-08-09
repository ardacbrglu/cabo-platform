// /lib/authOptions.js
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * SECURITY NOTES
 * - Custom JWT/cookie yok; NextAuth tek oturum kaynağı.
 * - Credentials.authorize: brute-force sayaçları ve status/role kapıları var.
 * - Google: yeni affiliate kullanıcıyı aktif oluşturuyoruz; pending ise giriş reddedilir.
 */

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not defined!");
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET is missing!");
}
// NEXTAUTH_URL prod'da zorunlu olmalı; local geliştirmede Next dev ayarlıyor.

const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000; // 15 dk

export const authOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Input kontrol
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password || "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Merchant buradan giriş yapamaz
        if (user.role === "merchant") return null;

        // Google-only kullanıcı (şifre yok) buradan giriş yapamaz
        if (!user.passwordHash) return null;

        // Hesap kilitli mi?
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) return null;

        // Parola doğrulama + brute-force sayaçları
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          const nextFailed = (user.failedAttempts || 0) + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedAttempts: nextFailed,
              lockUntil:
                nextFailed >= MAX_FAILED_ATTEMPTS
                  ? new Date(Date.now() + ACCOUNT_LOCK_DURATION)
                  : user.lockUntil,
            },
          });
          return null;
        }

        // Başarılı → sayaç sıfırla
        await prisma.user.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lockUntil: null },
        });

        // Hesap aktif değilse login yok
        if (user.status !== "active") return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        };
      },
    }),
  ],

  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 1 gün
  },

  callbacks: {
    async jwt({ token, user, account, profile }) {
      // İlk girişte user alanlarını JWT'ye yaz
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
    async signIn({ user, account }) {
      // Google akışı
      if (account?.provider === "google" && user?.email) {
        // Kullanıcı yoksa oluştur (affiliate, aktif)
        let existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (!existing) {
          await prisma.user.create({
            data: {
              name: user.name || "Google User",
              email: user.email,
              termsAccepted: true,
              status: "active",
              role: "affiliate",
              emailVerified: new Date(),
            },
          });
        }
        existing = await prisma.user.findUnique({ where: { email: user.email } });
        // pending ise izin verme
        if (existing?.status === "pending") return false;
      }
      return true;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
