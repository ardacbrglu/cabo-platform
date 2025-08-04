import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

export const GET = async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ success: false, message: "Token missing." }, { status: 400 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findFirst({
      where: {
        email: decoded.email,
        status: "pending",
        activationToken: token
      }
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "Invalid or expired token." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "active",
        activationToken: null,
        emailVerified: new Date()
      }
    });

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/login?activated=1`);

  } catch (err) {
    console.error("Activation error:", err);
    return NextResponse.json({ success: false, message: "Invalid token." }, { status: 400 });
  }
};
