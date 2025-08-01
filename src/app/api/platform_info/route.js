// app/api/platform_info/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const bankName = (await prisma.platform_config.findUnique({ where: { key_name: "platform_account_name" } }))?.value || "-";
    const iban = (await prisma.platform_config.findUnique({ where: { key_name: "platform_iban" } }))?.value || "-";
    return NextResponse.json({
      platform_account_name: bankName,
      platform_iban: iban
    });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
