export const dynamic = "force-dynamic";

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

export async function POST(req) {
  try {
    // 1) CSRF
    validateCsrfToken(req);

    // 2) Auth (NextAuth)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3) Rate limit: max 3 deneme / 15dk
    const { ok, resetMs } = await checkRateLimit({
      key: `settings:pwd:u:${userId}`,
      limit: 3,
      windowMs: 15 * 60_000,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
      );
    }

    // 4) Body doğrulama
    const { current_password, new_password } = passwordSchema.parse(await req.json());

    // 5) Kullanıcıyı çek
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Şifre hiç yoksa (ilk kez belirleme — Google only hesaplar)
    if (!user.passwordHash) {
      if (current_password && current_password.length > 0) {
        return NextResponse.json(
          { error: "You don't have a password yet, just set a new one." },
          { status: 400 }
        );
      }
      const newHash = await bcrypt.hash(new_password, 12);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
      return NextResponse.json({ success: true, firstTimeSet: true });
    }

    // Normal akış: mevcut şifre gerekli
    if (!current_password) {
      return NextResponse.json({ error: "Current password required." }, { status: 400 });
    }

    const okPw = await bcrypt.compare(current_password, user.passwordHash);
    if (!okPw) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/settings/change_password error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
