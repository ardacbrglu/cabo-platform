export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const passwordSchema = z.object({
  current_password: z.string().optional(),
  new_password: z.string().min(8, "Too short"),
});

function secureJson(data, init = {}) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

export async function POST(req) {
  try {
    // Content-Type
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return secureJson({ error: "Unsupported Media Type" }, { status: 415 });
    }

    // 1) CSRF
    await validateCsrfToken(req);

    // 2) Auth (NextAuth)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return secureJson({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) Rate limit: max 3 deneme / 15dk
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:pwd:u:${userId}`,
      limit: 3,
      windowMs: 15 * 60_000,
    });
    if (!ok) {
      return secureJson(
        { error: "Too many attempts" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 4) Body doğrulama
    const json = await req.json().catch(() => ({}));
    const parsed = passwordSchema.safeParse(json);
    if (!parsed.success) {
      return secureJson({ error: "Invalid payload" }, { status: 400 });
    }
    const { current_password, new_password } = parsed.data;

    // 5) Kullanıcıyı çek
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (!user) return secureJson({ error: "Unauthorized" }, { status: 401 });

    // Şifre aynı olmasın
    if (user.passwordHash) {
      const same = await bcrypt.compare(new_password, user.passwordHash);
      if (same) {
        return secureJson({ error: "New password must be different" }, { status: 400 });
      }
    }

    // Şifre hiç yoksa (ilk kez belirleme — Google only hesaplar)
    if (!user.passwordHash) {
      if (current_password && current_password.length > 0) {
        return secureJson(
          { error: "You don't have a password yet, just set a new one." },
          { status: 400 }
        );
      }
      const newHash = await bcrypt.hash(new_password, 12);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
      return secureJson({ success: true, firstTimeSet: true });
    }

    // Normal akış: mevcut şifre gerekli
    if (!current_password) {
      return secureJson({ error: "Current password required." }, { status: 400 });
    }

    const okPw = await bcrypt.compare(current_password, user.passwordHash);
    if (!okPw) {
      return secureJson({ error: "Current password is incorrect" }, { status: 403 });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return secureJson({ success: true });
  } catch (err) {
    console.error("POST /api/settings/change_password error:", err);
    return secureJson({ error: "Server error" }, { status: 500 });
  }
}
