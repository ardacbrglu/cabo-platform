// src/app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";        // Prisma/Node modülleri için Edge yerine Node
export const dynamic = "force-dynamic"; // auth endpoint’lerinde caching kapansın

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
