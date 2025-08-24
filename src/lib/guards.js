/**
 * File: src/lib/guards.js
 * Purpose: Merkezi AuthZ guard'ları
 *
 * Security Docblock (Cabo PROD):
 * - Tek oturum kaynağı: NextAuth getServerSession(authOptions)
 * - DB doğrulaması: status === "active", role kontrolü
 * - Hata sözleşmesi: throw { code, msg }  // route katmanı 401/403/500 map eder
 */

import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";

/** Aktif merchant gerektirir; yoksa 401/403 fırlatır. */
export async function requireMerchant() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase?.();
  if (!email) throw { code: 401, msg: "unauthorized" };

  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, status: true },
  });

  if (!u) throw { code: 401, msg: "unauthorized" };
  if (u.status !== "active") throw { code: 403, msg: "forbidden" };
  if (u.role !== "merchant") throw { code: 403, msg: "forbidden" };

  return { userId: u.id };
}

/* İlerde lazım olursa: aktif affiliate guard */
export async function requireAffiliate() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase?.();
  if (!email) throw { code: 401, msg: "unauthorized" };

  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, status: true },
  });

  if (!u) throw { code: 401, msg: "unauthorized" };
  if (u.status !== "active") throw { code: 403, msg: "forbidden" };
  if (u.role !== "affiliate") throw { code: 403, msg: "forbidden" };

  return { userId: u.id };
}
