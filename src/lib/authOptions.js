// /lib/authOptions.js

import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// .env zorunlulukları
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET environment variable is not defined!");
const JWT_SECRET = process.env.JWT_SECRET;

const MAX_failedAttempts = 5;
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000; // 15 dakika

// Token çekici (Cookie ve Authorization header destekli)
export function getTokenFromRequest(req) {
  const cookieHeader = req.headers?.get?.("cookie") || req.headers?.cookie || "";
  const authHeader = req.headers?.get?.("authorization") || req.headers?.authorization || "";

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  if (cookieHeader) {
    const match = cookieHeader.match(/cabo_token=([^;]+)/);
    return match ? match[1] : null;
  }
  return null;
}

// Token doğrulayıcı
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

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
        if (!credentials.email || !credentials.password) return null;
        const cleanEmail = credentials.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email: cleanEmail },
        });
        if (!user) return null;

        // Merchant ise giriş yapamaz
        if (user.role === "merchant") return null;

        // Şifre belirlenmemişse (Google ile kayıt olup henüz şifresi olmayanlar)
        if (!user.passwordHash || user.passwordHash === "") return null;

        // Hesap kilitli mi?
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
          return null;
        }

        // Parola doğrulama
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedAttempts: { increment: 1 },
              lockUntil:
                user.failedAttempts + 1 >= MAX_failedAttempts
                  ? new Date(Date.now() + ACCOUNT_LOCK_DURATION)
                  : user.lockUntil,
            },
          });
          return null;
        }

        // Başarılı girişte lock ve attempt sıfırlama
        await prisma.user.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lockUntil: null },
        });

        // Hesap aktif değilse giriş izni yok
        if (user.status !== "active") return null;

        // Giriş başarılı → user bilgileri dön
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
    signIn: "/login", // Manuel girişte login sayfası
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 1 gün
  },
  callbacks: {
    async jwt({ token, user }) {
      // Kullanıcıdan gelen bilgiler JWT'ye eklenir
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      // Oturum açınca JWT'deki id ve role session'a eklenir
      if (session.user && token?.sub) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // GOOGLE İLE KAYIT AKIŞI
      if (account?.provider === "google" && user?.email) {
        // Kullanıcı DB'de yoksa oluştur
        const existing = await prisma.user.findUnique({ where: { email: user.email } });

        if (!existing) {
          await prisma.user.create({
            data: {
              name: user.name || "Google User",
              email: user.email,
              termsAccepted: true,
              status: "active",
              role: "affiliate",
              emailVerified: new Date(),
              // languagePreference: profile?.locale?.toLowerCase() || "en",
            },
          });
        }

        // PENDING ise girişe izin verme
        if (existing?.status === "pending") {
          return false;
        }
      }
      // Diğer her durumda giriş yapılabilir
      return true;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
