export const dynamic = "force-dynamic";
import { csrf } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getTokenFromRequest, verifyToken } from "@/lib/authOptions";
import { checkRateLimit } from "@/lib/ratelimit";

export const POST = csrf(async (req) => {
  try {
    // IP bazlı rate limit
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(`createpw_${ip}`, 5, 60 * 1000)) {
      return Response.json({ success: false, message: "Too many requests. Please wait and try again." }, { status: 429 });
    }

    // JWT token ile doğrulama (kullanıcıya ait, session üzerinden alınır)
    const token = getTokenFromRequest(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload?.email) {
      return Response.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    // Password'u al ve basic validation
    const { password } = await req.json();
    if (!password || password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return Response.json({ success: false, message: "Password too weak." }, { status: 400 });
    }

    // User'ı bul ve passwordHash yoksa devam et
    const user = await prisma.user.findUnique({
      where: { email: payload.email }
    });
    if (!user || user.passwordHash) {
      return Response.json({ success: false, message: "Invalid user or already set." }, { status: 400 });
    }

    // Parolayı hashle ve kaydet, kullanıcıyı aktive et
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { email: payload.email },
      data: {
        passwordHash: hashed,
        status: "active",      // her ihtimale karşı aktif yap
        failedAttempts: 0,
        lockUntil: null
      }
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error("CREATE PASSWORD ERROR:", err);
    return Response.json({ success: false, message: "Server error." }, { status: 500 });
  }
});
