// app/api/currencies/route.js
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { logApiEvent } from "@/lib/ratelimit";

export async function GET(req) {
  try {
    // Session kontrolü (eğer endpoint özel olacaksa)
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const currencies = await prisma.currency.findMany();
    const arr = currencies.map(cur => ({
      value: cur.code,
      label: `${cur.symbol ? cur.symbol + " " : ""}${
        cur.code === "TRY"
          ? "Türk Lirası"
          : cur.code === "EUR"
          ? "Euro"
          : cur.code === "USD"
          ? "US Dollar"
          : cur.code
      }`,
    }));

    return NextResponse.json({ currencies: arr });

  } catch (err) {
    console.error("Currencies API error:", err);
    await logApiEvent({
      endpoint: "currencies",
      event: "error",
      error: String(err),
    });

    // Hata durumunda fallback
    return NextResponse.json({
      currencies: [{ value: "TRY", label: "₺ Türk Lirası" }],
    });
  }
}
