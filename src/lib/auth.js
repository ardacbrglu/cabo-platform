/**
 * /lib/auth.js
 * NextAuth v5 helper: middleware ve server action'lar için { auth, handlers, signIn, signOut }.
 * Tüm katmanlarda **aynı** authOptions kullanılır (Edge/Node tutarlılığı).
 */
import NextAuth from "next-auth";
import { authOptions } from "./authOptions";

export const { auth, handlers, signIn, signOut } = NextAuth(authOptions);
