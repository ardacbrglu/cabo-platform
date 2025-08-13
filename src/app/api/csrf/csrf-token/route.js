export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { cookies } from "next/headers";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrf_token";
const TWO_HOURS = 60 * 60 * 2;

export async function GET() {
  const cookieStore = cookies();
  let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    cookieStore.set(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: TWO_HOURS,
    });
  }

  return new Response(JSON.stringify({ csrf_token: token }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Cookie",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
