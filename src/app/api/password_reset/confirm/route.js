export const dynamic = "force-dynamic";
import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const POST = csrf(async (req) => {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return Response.json({ success: false, message: "Missing data." }, { status: 400 });
    }
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return Response.json({ success: false, message: "Password too weak." }, { status: 400 });
    }
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() }
      }
    });
    if (!user) {
      return Response.json({ success: false, message: "Token invalid or expired." }, { status: 400 });
    }
    // Şifreyi hashle, reset tokenı sil
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashed,
        resetToken: null,
        resetTokenExpiry: null,
        failedAttempts: 0,
        lockUntil: null
      }
    });
    return Response.json({ success: true, message: "Password successfully changed." });
  } catch (err) {
    console.error("RESET PASSWORD CONFIRM ERROR:", err);
    return Response.json({ success: false, message: "Server error." }, { status: 500 });
  }
});
