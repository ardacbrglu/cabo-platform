// app/api/register/google-precheck/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const COOKIE_NAME = "google_reg_precheck";
const MAX_AGE_SECONDS = 10 * 60; // 10 dk

export async function POST() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const token = jwt.sign(
    { scope: "google_registration_precheck" },
    secret,
    { expiresIn: MAX_AGE_SECONDS }
  );

  cookies().set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return NextResponse.json({ ok: true }, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
