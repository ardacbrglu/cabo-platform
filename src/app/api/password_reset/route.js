import { csrf } from '@/lib/csrf';
import prisma from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/mailer';
import { v4 as uuidv4 } from 'uuid';
import { addMinutes } from 'date-fns';

export const POST = csrf(async (req) => {
  try {
    const { email } = await req.json();
    if (!email) {
      return Response.json({ success: false, message: "E-posta gerekli." }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      // Kullanıcıyı ifşa etme (her durumda success dön)
      return Response.json({ success: true, message: "If user exists, password reset email sent." });
    }

    // Token oluştur ve veritabanına kaydet (tek kullanımlık)
    const token = uuidv4();
    const expires = addMinutes(new Date(), 15);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpiry: expires,
      }
    });

    await sendPasswordResetEmail(user.email, token);

    return Response.json({ success: true, message: "If user exists, password reset email sent." });
  } catch (err) {
    console.error("RESET REQUEST ERROR:", err);
    return Response.json({ success: false, message: "Error sending password reset email." }, { status: 500 });
  }
});
