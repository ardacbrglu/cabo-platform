import { cookies } from 'next/headers';
import crypto from "crypto";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 2 // 2 saat
};

export async function GET() {
  const cookieStore = cookies();
  let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    cookieStore.set(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
  }

  return new Response(JSON.stringify({ csrf_token: token }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
