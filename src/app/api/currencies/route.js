// app/api/currencies/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/authz";
import { logApiEvent } from "@/lib/ratelimit";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const currencies = await prisma.currency.findMany();
    const arr = currencies.map((cur) => ({
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

    return NextResponse.json(
      { currencies: arr },
      { headers: { "Cache-Control": "no-store", Vary: "Cookie" } }
    );
  } catch (err) {
    console.error("Currencies API error:", err);
    try {
      await logApiEvent({
        endpoint: "currencies",
        event: "error",
        error: String(err),
      });
    } catch {}

    // Fallback
    return NextResponse.json(
      { currencies: [{ value: "TRY", label: "₺ Türk Lirası" }] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
