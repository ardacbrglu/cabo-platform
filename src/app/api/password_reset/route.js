export const dynamic = "force-dynamic";
import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/mailer';
import { randomBytes } from 'crypto';

const RESET_EXPIRY_MINUTES = 15;

export const POST = csrf(async (req) => {
  try {
    const { email } = await req.json();
    if (!email) {
      return Response.json({ success: false, message: "Email required." }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user || !user.passwordHash) {
      // **Kullanıcı yoksa veya sosyal login-only ise, yine de "success" dön!**
      return Response.json({ success: true, message: "If user exists, password reset email sent." });
    }

    // **Token oluştur ve User tablosunda sakla**
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpiry: expires
      }
    });

    // **Mail gönder**
    await sendPasswordResetEmail(user.email, token);

    return Response.json({ success: true, message: "If user exists, password reset email sent." });
  } catch (err) {
    console.error("RESET PASSWORD REQUEST ERROR:", err);
    return Response.json({ success: false, message: "Server error." }, { status: 500 });
  }
});
