// ✅ app/api/activate/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PROD_!@#_Cabo";

export async function GET(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ success: false, message: "Token missing." }, { status: 400 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.status === "active") {
      return NextResponse.json({ success: false, message: "Already activated or user not found." }, { status: 400 });
    }

    await prisma.user.update({
      where: { email },
      data: {
        status: "active",
        emailVerified: true,
        activationToken: null,
      },
    });

    return NextResponse.redirect(new URL("/activated", req.url));
  } catch (err) {
    console.error("ACTIVATION ERROR:", err);
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }
}
