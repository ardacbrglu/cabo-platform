// lib/authOptions.js (NextAuth v5 - JS)
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not defined!");
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET is missing!");
}
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined!");

const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000; // 15 dk

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
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password || "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Merchant portal değil → reddet
        if (user.role === "merchant") return null;

        // Google-only (şifre yok) → credentials ile giriş reddi
        if (!user.passwordHash) return null;

        // Kilitli hesap?
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) return null;

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

        // Aktif olmayan hesap → reddet
        if (user.status !== "active") return null;

        return {
          id: String(user.id),
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
    async jwt({ token, user }) {
      if (user) {
        token.sub = String(user.id);
        token.email = user.email;
        token.role = user.role;
        token.status = user.status;
      } else if (token?.email) {
        try {
          const u = await prisma.user.findUnique({
            where: { email: token.email },
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
      if (account?.provider === "google" && user?.email) {
        const email = user.email.toLowerCase();
        let existing = await prisma.user.findUnique({ where: { email } });

        // Merchant → reddet
        if (existing?.role === "merchant") return false;

        if (!existing) {
          // Yeni kullanıcı → precheck cookie zorunlu
          const ok = verifyGooglePrecheckCookie();
          return !!ok; // PrismaAdapter user'ı yaratacak
        }

        if (existing.status === "pending") {
          const ok = verifyGooglePrecheckCookie();
          if (!ok) return false;
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              status: "active",
              termsAccepted: true,
              emailVerified: existing.emailVerified ?? new Date(),
              role: existing.role || "affiliate",
            },
          });
          return true;
        }

        return existing.status === "active";
      }

      return true;
    },
  },

  events: {
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

  secret: process.env.NEXTAUTH_SECRET,
};
