import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GÜVENLİK NOTU: Tüm env secret'lar zorunlu!
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
    // Manuel giriş için e-posta/şifre provider
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // GÜVENLİK NOTU: Input validation
        if (!credentials.email || !credentials.password) return null;
        const cleanEmail = credentials.email.trim().toLowerCase();

        // Kullanıcıyı çek
        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (!user) return null;

        // Merchant ise (normal kullanıcı girişi için) izin yok
        if (user.role === "merchant") return null;

        // Sadece şifre belirlemiş kullanıcılar login olabilir (Google-only olanları engelle)
        if (!user.passwordHash || user.passwordHash === "") return null;

        // Hesap kilitli mi?
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) return null;

        // Parola doğrulama
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

        // Hesap aktif değilse giriş izni yok
        if (user.status !== "active") return null;

        // Kullanıcı session objesi
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

  // Custom pages (login sayfası)
  pages: {
    signIn: "/login",
    // error: "/auth/error", // (opsiyonel)
  },

  // Session config (JWT tabanlı)
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 1 gün
  },

  // NextAuth Callback'leri
  callbacks: {
    async jwt({ token, user }) {
      // İlk girişte, JWT'ye custom field'lar eklenir
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      // Oturum açınca, JWT'deki veriler session.user'a aktarılır
      if (session.user && token?.sub) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
    async signIn({ user, account }) {
      // Google ile login/signup akışı:
      if (account?.provider === "google" && user?.email) {
        // Kullanıcı yoksa oluştur (affiliate)
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
              // languagePreference: "en", // opsiyonel
            },
          });
        }
        existing = await prisma.user.findUnique({ where: { email: user.email } });
        // Eğer "pending" durumdaysa giriş izni verme!
        if (existing?.status === "pending") return false;
      }
      // Diğer tüm kontrollerden geçiyorsa → giriş izni ver
      return true;
    },
  },

  // Secret
  secret: process.env.NEXTAUTH_SECRET,
};
