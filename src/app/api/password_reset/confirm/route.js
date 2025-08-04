import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req) {
  try {
    const { token, newPassword } = await req.json();
    if (!token || !newPassword) {
      return Response.json({ success: false, message: "Eksik bilgi." }, { status: 400 });
    }
    const record = await prisma.password_reset_token.findUnique({ where: { token } });
    if (!record || record.used || record.expires_at < new Date()) {
      return Response.json({ success: false, message: "Token geçersiz veya süresi dolmuş." }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { user_id: record.user_id } });
    if (!user) {
      return Response.json({ success: false, message: "Kullanıcı bulunamadı." }, { status: 404 });
    }
    // Şifre hashle ve kaydet
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { user_id: user.user_id },
      data: { password_hash: hashed }
    });
    // Tokenı kullanılmış yap
    await prisma.password_reset_token.update({
      where: { token },
      data: { used: true }
    });
    return Response.json({ success: true, message: "Şifre başarıyla değiştirildi." });
  } catch (err) {
    return Response.json({ success: false, message: "Hata oluştu." }, { status: 500 });
  }
}
