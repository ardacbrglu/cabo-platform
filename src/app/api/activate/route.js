import prisma from '@/lib/prisma';

export const GET = async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return Response.json({ success: false, message: "Invalid activation token." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { activation_token: token, status: "pending" } });
  if (!user) {
    return Response.json({ success: false, message: "Token invalid or already used." }, { status: 400 });
  }

  await prisma.user.update({
    where: { user_id: user.user_id },
    data: { status: "active", activation_token: null }
  });

  // İsteğe bağlı: frontendde bir sayfaya yönlendirme yapabilirsin.
  return Response.json({ success: true, message: "Your account has been activated! You can now log in." });
};
