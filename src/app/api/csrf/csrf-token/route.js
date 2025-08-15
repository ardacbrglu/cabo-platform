// app/api/csrf/csrf-token/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrf_token";
const TWO_HOURS = 60 * 60 * 2;

export async function GET() {
  const token = crypto.randomBytes(32).toString("hex");

  const res = NextResponse.json(
    { csrf_token: token, csrfToken: token },
    {
      headers: {
        "Cache-Control": "no-store",
        "Vary": "Cookie",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );

  res.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TWO_HOURS,
  });

  return res;
}
