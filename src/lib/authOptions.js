import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";  // NextAuth v5+
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions = {
  // PRISMA ADAPTER ZORUNLU — DB'ye otomatik kayıt için
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
        // Kullanıcıyı email ile bul
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;

        // Şifre kontrolü
        const isValid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!isValid) return null;

        // Sadece "active" durumundaki user'ı login ettir
        if (user.status !== "active") {
          // Gelişmiş kontrol eklemek istersen: hata mesajı dönebilirsin
          // throw new Error("Please activate your email.");
          return null;
        }

        // NextAuth session objesi
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
    signIn: "/login", // Custom login sayfan
  },

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 1 gün
  },

  callbacks: {
    // JWT token'a user bilgilerini ekle
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    // Session'a user bilgilerini token'dan geçir
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
  },

  events: {
    // Google ile yeni gelen user'da termsAccepted otomatik true
    async createUser({ user }) {
      await prisma.user.update({
        where: { email: user.email },
        data: { termsAccepted: true }
      });
    }
  },

  secret: process.env.NEXTAUTH_SECRET,

  // debug: true, // İsteğe bağlı, debug için açabilirsin
};
