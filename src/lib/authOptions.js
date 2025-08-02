// /lib/authOptions.js

import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions = {
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
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!isValid) return null;

        // 🔒 Sadece e-mail ile gelenler için statü kontrolü: (Google ile gelenler zaten 'active' olacak)
        if (user.status !== "active") {
          // İstersen burada spesifik hata mesajı döndürebilirsin
          // throw new Error("Lütfen e-posta aktivasyonunuzu tamamlayın.");
          return null;
        }

        return {
          id: user.user_id,
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
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
