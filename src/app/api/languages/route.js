// app/api/languages/route.js

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  // platformConfig tablosunda 'languages' key'inde ["en","tr"] gibi saklanıyor olmalı!
  try {
    const config = await prisma.platformConfig.findUnique({
      where: { keyName: "languages" }
    });

    let langs = [
      { value: "en", label: "English" },
      { value: "tr", label: "Türkçe" }
    ];
    if (config && config.value) {
      try {
        const arr = JSON.parse(config.value);
        // Burası senin istediğin label yapısına göre değişebilir.
        langs = arr.map(code => ({
          value: code,
          label:
            code === "tr" ? "Türkçe" :
            code === "en" ? "English" :
            code
        }));
      } catch {}
    }
    return NextResponse.json({ languages: langs });
  } catch (err) {
    return NextResponse.json({ languages: [
      { value: "en", label: "English" },
      { value: "tr", label: "Türkçe" }
    ]});
  }
}
