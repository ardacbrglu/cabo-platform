// /src/lib/prisma.js
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma__ ||
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma__ = prisma;
}

export default prisma;
