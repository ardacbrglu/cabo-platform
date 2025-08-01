// /lib/authOptions.js

import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions = {
  providers: [
    // Google ile giriş (kendi clientId/clientSecret'ını ekle)
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),

    // E-posta/şifre ile giriş
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Kullanıcıyı email ile bul
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        // Kullanıcı bulunamadıysa veya şifre yanlışsa null dön
        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!isValid) return null;

        // User varsa, NextAuth için gerekli user objesini dön
        return {
          id: user.user_id,
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login", // Giriş ekranı için custom sayfa
  },
  session: {
    strategy: "jwt", // JWT tabanlı session (modern ve hızlı)
    maxAge: 60 * 60 * 24, // 1 gün (isteğe göre uzatabilirsin)
  },
  callbacks: {
    // Session callback: token’dan user id’yi session.user.id’ye aktarır
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    // JWT callback: kullanıcı giriş yaptıysa user id ve email’i token’a ekler
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
      }
      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET, // Güvenlik için .env’de sakla
};
