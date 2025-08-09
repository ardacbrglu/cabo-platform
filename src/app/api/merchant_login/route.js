export const dynamic = "force-dynamic";

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not defined!");
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth env'leri eksik!");

const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000; // 15 dk

export const authOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    // Google OAuth2 provider
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    // Merchant & affiliate login (Credentials)
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        loginType: { label: "Login Type", type: "text" }, // "merchant" veya "affiliate"
      },
      async authorize(credentials) {
        if (!credentials.email || !credentials.password) return null;

        const cleanEmail = credentials.email.trim().toLowerCase();
        const loginType = credentials.loginType || "affiliate"; // default

        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (!user) return null;

        // Merchant login isteyenler için role kontrolü
        if (loginType === "merchant" && user.role !== "merchant") {
          return null; // Merchant değilse giriş yok
        }

        // Google-only hesaplar (password yoksa) giriş yapamaz
        if (!user.passwordHash || user.passwordHash === "") return null;

        // Hesap kilitli mi?
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) return null;

        // Şifre doğrulama
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedAttempts: { increment: 1 },
              lockUntil:
                user.failedAttempts + 1 >= MAX_FAILED_ATTEMPTS
                  ? new Date(Date.now() + ACCOUNT_LOCK_DURATION)
                  : user.lockUntil,
            },
          });
          return null;
        }

        // Giriş başarılı → lock/attempt sıfırla
        await prisma.user.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lockUntil: null },
        });

        // Sadece active hesaplar giriş yapabilir
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
    maxAge: 60 * 60 * 24,
  },

  callbacks: {
    async jwt({ token, user }) {
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
      if (account?.provider === "google" && user?.email) {
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
        if (existing?.status === "pending") return false;
      }
      return true;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
