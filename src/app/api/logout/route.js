// app/api/logout/route.js
export const dynamic = "force-dynamic";

import { verifyCsrfToken } from "@/lib/csrf"; 
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { NextResponse } from "next/server";

const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";

export async function POST(req) {
  // 1. CSRF kontrolü
  await verifyCsrfToken(req);

  // 2. Kullanıcı oturumunu doğrula
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 3. Response başlat
  const res = NextResponse.json({ success: true });

  // 4. Eğer cabo_token varsa, temizle
  const caboToken = req.headers.get("cookie")?.match(/cabo_token=([^;]+)/);
  if (caboToken) {
    res.headers.set(
      "Set-Cookie",
      `cabo_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secureFlag}`
    );
  }

  return res;
}

// GET ile de logout’a izin ver (opsiyonel)
export const GET = POST;
