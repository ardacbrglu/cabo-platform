// src/lib/authOptions.js
/**
 * Security Docblock (Cabo PROD)
 * - Tek oturum kaynağı: NextAuth (Credentials + Google)
 * - JWT session stratejisi; kullanıcı rol/durum bilgisi token'a yazılır.
 * - JWT, rol/durum bilgisini düzenli aralıklarla DB'den tazeler (TTL).
 * - Adapter: PrismaAdapter (OAuth hesaplarının persist edilmesi için)
 * - RBAC + status kapıları authorize/signIn aşamasında da uygulanır.
 */

import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendWelcomeAffiliateNotification } from "@/lib/notify";

/* --------------------------- helpers --------------------------- */
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
function getUserLocale(u) {
  const raw = u?.languagePreference || u?.language || u?.locale || u?.preferredLocale || "";
  const s = String(raw || "").toLowerCase();
  if (s.startsWith("en")) return "en";
  if (s.startsWith("tr")) return "tr";
  return "tr";
}

const ROLE_SYNC_TTL_MS = 60 * 1000; // 60s: middleware token'ı güncel tutma amaçlı makul TTL

/* --------------------------------------------------------------- */

export const authOptions = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma),
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
              id: true, email: true, passwordHash: true,
              role: true, status: true, name: true, image: true,
              accounts: { select: { provider: true }, take: 1 },
            },
          });
          if (!user) return null;

          // Google-only hesap şifreyle giremez
          const isGoogleOnly = !user.passwordHash && (user.accounts || []).some(a => a.provider === "google");
          if (isGoogleOnly) return null;

          // RBAC + status
          if (!["affiliate", "merchant"].includes(user.role)) return null;
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
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: false,
        })]
      : []),
  ],

  pages: { signIn: "/login" },

  callbacks: {
    async signIn({ user, account, req }) {
      if (account?.provider !== "google") return true;

      const emailLower = (user?.email || "").toLowerCase();
      if (!emailLower) return false;

      const existing = await prisma.user.findUnique({
        where: { email: emailLower },
        select: { status: true },
      });
      if (existing) return existing.status === "active";

      const cookieHeader = req?.headers?.get?.("cookie") || "";
      const m = cookieHeader.match(/(?:^|;\s*)google_reg_precheck=([^;]+)/i);
      const token = m ? decodeURIComponent(m[1]) : null;

      const scheme =
        req?.headers?.get?.("x-forwarded-proto") ||
        (req?.url ? new URL(req.url).protocol.replace(":", "") : "https");
      const host = req?.headers?.get?.("x-forwarded-host") || req?.headers?.get?.("host") || "";
      const baseUrl = process.env.NEXTAUTH_URL || `${scheme}://${host}`;

      try {
        if (!token) return `${baseUrl}/register?err=google_precheck`;
        jwt.verify(token, process.env.NEXTAUTH_SECRET);
        return true;
      } catch {
        return `${baseUrl}/register?err=google_precheck`;
      }
    },

    async jwt({ token, user }) {
      // Login/first issue: kullanıcıdan gelen değerler token'a yazılır
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.name = user.name || "";
        token.email = user.email || token.email;
        token._rls = Date.now(); // role last sync
        return token;
      }

      // Periyodik DB senkronu: rol/durum değişmişse middleware'ın gördüğü token güncellensin
      const now = Date.now();
      const shouldResync = !token._rls || (now - token._rls) > ROLE_SYNC_TTL_MS;

      if (shouldResync && token?.email) {
        try {
          const u = await prisma.user.findUnique({
            where: { email: token.email.toLowerCase() },
            select: { id: true, role: true, status: true, name: true },
          });
          if (u) {
            token.id = u.id;
            token.role = u.role;
            token.status = u.status;
            token.name = u.name || token.name;
            token._rls = now;
          }
        } catch {
          // sessiz yut
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
      session.user.email = token.email || session.user.email || "";
      return session;
    },

    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);
        if (u.origin === baseUrl) return u.toString();
        return baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },

  events: {
    // OAuth ile ilk kez user oluştuğunda tetiklenir
    async createUser({ user }) {
      try {
        const idNum = Number(user.id);
        const whereById = { id: Number.isFinite(idNum) ? idNum : user.id };

        await prisma.user.update({
          where: whereById,
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

        const fresh = await prisma.user.findUnique({
          where: whereById,
          select: { id: true, name: true, languagePreference: true, language: true, locale: true, preferredLocale: true },
        });

        const locale = getUserLocale(fresh);
        await sendWelcomeAffiliateNotification({
          userId: fresh.id,
          name: fresh.name,
          locale,
        });
      } catch (e) {
        console.error("events.createUser welcome notif error:", e);
      }
    },
  },
};
