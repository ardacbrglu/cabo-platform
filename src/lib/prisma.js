// src/lib/prisma.js
// SECURITY REVIEW: DB bilgileri environment değişkenlerinde tutulmalı.
// Üretimde gereksiz query loglarını kapalı tut.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  errorFormat: "minimal",
});

// Serverless olmayan ortamlarda dev’de tek instance cache’le:
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

// NOTE: Serverless çevrelerde aşırı PrismaClient oluşturmayın.
// Barındırıcınızın en iyi pratiklerine göre konfigüre edin.
