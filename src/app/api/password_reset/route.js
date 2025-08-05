import { csrf } from '@/lib/csrf';

// SECURITY REVIEW: This route uses the csrf middleware. Ensure the CSRF secret is strong and not default. Consider per-session/user tokens for higher security.
import prisma from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { sendPasswordResetEmail } from '@/lib/mailer'; // aşağıda anlatacağım
import { addMinutes } from 'date-fns';

export const POST = csrf(async (req) => {
  // SECURITY REVIEW: All state-changing logic is protected by CSRF here. Keep this for all sensitive endpoints.
  try {
    const { email } = await req.json();
    if (!email) {
      return Response.json({ success: false, message: "E-posta gerekli." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      // Kullanıcıyı ifşa etme (her durumda success dön)
      return Response.json({ success: true, message: "If user exists, password reset email sent." });
    }

    // Token oluştur ve veritabanına kaydet
    const token = uuidv4();
    const expires = addMinutes(new Date(), 15);
    await prisma.password_reset_token.create({
      data: {
        user_id: user.user_id,
        token,
        expires_at: expires,
        used: false,
      }
    });

    // Mail gönder (mailer ile)
    await sendPasswordResetEmail(user.email, token);

    return Response.json({ success: true, message: "If user exists, password reset email sent." });
  } catch (err) {
    return Response.json({ success: false, message: "Error sending password reset email." }, { status: 500 });
  }
});
