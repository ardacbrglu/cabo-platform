// app/api/currencies/route.js

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currencies = await prisma.currency.findMany();
    // label: "₺ Türk Lirası"
    const arr = currencies.map(cur => ({
      value: cur.code,
      label: `${cur.symbol ? cur.symbol + " " : ""}${cur.code === "TRY" ? "Türk Lirası" : cur.code === "EUR" ? "Euro" : cur.code === "USD" ? "US Dollar" : cur.code}`
    }));
    return NextResponse.json({ currencies: arr });
  } catch {
    return NextResponse.json({ currencies: [
      { value: "TRY", label: "₺ Türk Lirası" }
    ]});
  }
}
