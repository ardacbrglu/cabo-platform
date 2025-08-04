// ✅ BACKEND: app/api/activate/route.js
import prisma from '@/lib/prisma';
export const dynamic = "force-dynamic";

export const GET = async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return Response.json({ success: false, message: "Invalid activation token." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({ where: { activationToken: token, status: "pending" } });

    if (!user) {
      return Response.json({ success: false, message: "Token invalid or already used." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "active",
        activationToken: null,
        emailVerified: new Date()
      }
    });

    return Response.json({ success: true, message: "Your account has been activated! You can now log in." });

  } catch (err) {
    console.error("ACTIVATION ERROR:", err);
    return Response.json({ success: false, message: "Server error." }, { status: 500 });
  }
};
