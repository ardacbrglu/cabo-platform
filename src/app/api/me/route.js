// src/app/api/me/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

function jsonSafe(payload, init = {}) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function GET() {
  try {
    const s = await auth(); // NextAuth v5 helper
    const u = s?.user;
    if (!u) return jsonSafe({ authenticated: false });

    return jsonSafe({
      authenticated: true,
      userId: u.id || u.sub || null,
      email: u.email || null,
      name: u.name || "",
      role: u.role || null,
      status: u.status || null,
    });
  } catch {
    // Anon döndür, UI kırılmasın
    return jsonSafe({ authenticated: false });
  }
}
