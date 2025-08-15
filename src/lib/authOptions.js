// /src/lib/authOptions.js
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const isProd = process.env.NODE_ENV === "production";

// Prod’da zorunlu ama build’te throw etmiyoruz (runtime’da olmalı!)
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || (!isProd ? "dev-nextauth-secret" : undefined);
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
  pages: { signIn: "/login" },

  providers: [
    // Credentials her zaman dursun
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

        // Manuel girişten merchant'ı engelle
        if (user.role === "merchant") return null;

        // Google-only hesaplara manuel login yok
        if (!user.passwordHash) return null;

        // Hesap kilitli mi?
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

        // Aktif değilse reddet
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

    // Google sadece env varsa eklensin
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
      if (account?.provider !== "google") return true;
      const email = user?.email?.toLowerCase?.();
      if (!email) return false;

      const existing = await prisma.user.findUnique({ where: { email } });

      if (existing?.role === "merchant") return false;

      if (!existing) {
        const ok = verifyGooglePrecheckCookie();
        return !!ok;
      }
      return existing.status === "active";
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

  // Prod’da runtime’da set edilmesi şart; dev’de fallback geliyor
  secret: NEXTAUTH_SECRET,
};
