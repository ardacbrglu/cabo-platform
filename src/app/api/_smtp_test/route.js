// src/app/api/_smtp_test/route.js
import { NextResponse } from "next/server";
import { verifySMTP } from "@/lib/mailer";
export async function GET() {
  const r = await verifySMTP();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
