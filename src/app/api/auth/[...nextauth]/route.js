export const runtime = "nodejs";

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined.");

function safeUser(u) {
  return u
    ? { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, termsAccepted: u.termsAccepted }
    : null;
}

const authOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email || "").trim().toLowerCase();
        const password = String(creds?.password || "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (user.role === "merchant") return null;
        if (user.status !== "active") return null;
        if (!user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return safeUser(user);
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // İSTERSEN: manuel hesapla otomatik linklemeyi zorlarsan aç:
      // allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Credentials yolu: authorize filtreledi
      if (account?.provider !== "google") return true;

      const existing = user?.email
        ? await prisma.user.findUnique({ where: { email: user.email } })
        : null;

      // Merchant blok
      if (existing && existing.role === "merchant") return false;

      // Yeni Google kullanıcısı: sadece precheck varsa izin ver
      if (!existing) {
        const token = cookies().get("google_reg_precheck")?.value;
        if (!token) return false;
        try {
          const payload = jwt.verify(token, JWT_SECRET);
          if (payload?.scope !== "google_registration_precheck") return false;
        } catch {
          return false;
        }
        return true; // PrismaAdapter yeni user'ı oluşturacak
      }

      // Mevcut user aktif değilse engelle (politikaya göre)
      if (existing.status !== "active") return false;

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
      } else if (token?.email) {
        // refresh sırasında rol/durum güncel kalsın
        const u = await prisma.user.findUnique({ where: { email: token.email } });
        if (u) {
          token.role = u.role;
          token.status = u.status;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
  },
  events: {
    // İlk defa OAuth ile oluşturulan kullanıcıyı patch’le
    async createUser({ user }) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            role: "affiliate",
            status: "active",
            termsAccepted: true,
            emailVerified: new Date(),
          },
        });
      } catch {
        /* sessiz geç */
      }
    },
  },
  // İsteğe bağlı özel sayfalar:
  // pages: { signIn: "/login" },
  debug: process.env.NODE_ENV !== "production",
  trustHost: true,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
