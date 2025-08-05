import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const POST = csrf(async (req) => {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return Response.json({ success: false, message: "Eksik bilgi." }, { status: 400 });
    }

    // Kullanıcıyı bul
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() }
      }
    });

    if (!user) {
      return Response.json({ success: false, message: "Token geçersiz veya süresi dolmuş." }, { status: 400 });
    }

    // Parola hashle ve kaydet, tokenları sıfırla
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashed,
        resetToken: null,
        resetTokenExpiry: null,
        failedAttempts: 0,
        lockUntil: null,
      }
    });

    return Response.json({ success: true, message: "Şifre başarıyla değiştirildi." });
  } catch (err) {
    console.error("RESET CONFIRM ERROR:", err);
    return Response.json({ success: false, message: "Hata oluştu." }, { status: 500 });
  }
});
