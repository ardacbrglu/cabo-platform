// /lib/authOptions.js
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

/**
 * SECURITY NOTES
 * - Tek oturum kaynağı NextAuth (custom JWT/cookie yok).
 * - Credentials.authorize: brute-force sayaçları ve status/role kapıları var.
 * - Google: Yeni kullanıcı oluşturulacaksa önce /api/register (flow:"google") ile
 *   terms+reCAPTCHA "precheck" zorunlu. Precheck → HttpOnly, imzalı cookie: google_reg_precheck.
 *   Precheck doğrulanırsa yeni kullanıcı affiliate+active açılır ve otomatik login olur.
 *   Mevcut kullanıcı login’inde precheck zorunlu değildir (yalnızca kayıt anı için gereklidir).
 */

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not defined!");
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET is missing!");
}
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not defined!");

// Credentials brute-force
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION = 15 * 60 * 1000; // 15 dk

function verifyGooglePrecheckCookie() {
  try {
    const c = cookies().get("google_reg_precheck")?.value;
    if (!c) return false;
    const payload = jwt.verify(c, JWT_SECRET);
    return payload && payload.scope === "google_registration_precheck";
  } catch {
    return false; // exp/invalid vs.
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
        // Input kontrol
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password || "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Merchant buradan giriş yapamaz
        if (user.role === "merchant") return null;

        // Google-only kullanıcı (şifre yok) buradan giriş yapamaz
        if (!user.passwordHash) return null;

        // Hesap kilitli mi?
        if (user.lockUntil && new Date(user.lockUntil) > new Date()) return null;

        // Parola doğrulama + brute-force sayaçları
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

        // Hesap aktif değilse login yok
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
    maxAge: 60 * 60 * 24, // 1 gün
  },

  callbacks: {
    async jwt({ token, user }) {
      // İlk girişte user alanlarını JWT'ye yaz
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.role = user.role;
        token.status = user.status;
      } else if (token?.email) {
        // Kullanıcı güncellemeleri için taze değerleri DB'den çek (status/role değişmiş olabilir)
        try {
          const u = await prisma.user.findUnique({
            where: { email: token.email },
            select: { id: true, role: true, status: true },
          });
          if (u) {
            token.sub = u.id;
            token.role = u.role;
            token.status = u.status;
          }
        } catch {}
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
      // Yalnız Google akışına özel kurallar
      if (account?.provider === "google" && user?.email) {
        const email = user.email.toLowerCase();

        // Varsa mevcut kullanıcıyı çek
        let existing = await prisma.user.findUnique({ where: { email } });

        // Merchant hesapların Google ile girmesine izin verme
        if (existing?.role === "merchant") return false;

        if (!existing) {
          // YENİ KAYIT: Precheck cookie zorunlu
          const ok = verifyGooglePrecheckCookie();
          if (!ok) return false; // terms+captcha yapılmamışsa reddet
          // Not: Kullanıcıyı burada yaratmıyoruz, PrismaAdapter yeni user'ı oluşturacak.
          // createUser event'inde status/role/terms/emailVerified alanlarını finalize edeceğiz.
          return true;
        }

        // MEVCUT KULLANICI:
        // Eski dönemde 'pending' açılmış Google kullanıcıları olabilir.
        // Precheck varsa otomatik aktive et, yoksa reddet (kayıt akışından gelmiyor demektir).
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

        // Active kullanıcı → login serbest
        return existing.status === "active";
      }

      return true;
    },
  },

  // İlk Google login'inde (kullanıcı yoksa) PrismaAdapter user oluşturduktan sonra tetiklenir
  events: {
    async createUser({ user, account }) {
      // Sadece Google kaydında alanları finalize et
      if (account?.provider === "google" && user?.email) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              // Google ile "register" anında aktif + affiliate
              status: "active",
              role: "affiliate",
              termsAccepted: true,
              emailVerified: user.emailVerified ?? new Date(),
            },
          });
        } catch {
          // Sessiz geç: başarısızsa default değerlerle kalır, sonraki login'de jwt/session günceller
        }
      }
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
