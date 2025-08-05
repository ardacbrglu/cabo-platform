import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_PROD_SECRET";

export async function GET(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    if (!user || user.status === "active") {
      return NextResponse.redirect(new URL("/activated?error=1", req.url));
    }

    await prisma.user.update({
      where: { email },
      data: {
        status: "active",
        emailVerified: new Date(),
        activationToken: null,
      },
    });

    return NextResponse.redirect(new URL("/activated", req.url));
  } catch (err) {
    console.error("❌ Activation error:", err);
    return NextResponse.redirect(new URL("/activated?error=1", req.url));
  }
}
