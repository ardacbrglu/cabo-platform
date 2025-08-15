// src/lib/auth.js
import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

// Tek yerden tüm helpers:
export const { auth, signIn, signOut, handlers } = NextAuth(authOptions);
