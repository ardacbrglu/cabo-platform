import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // Eğer Currency tablosu boşsa fallback: TRY
    let currencies = await prisma.currency.findMany();
    if (!currencies.length) {
      currencies = [{ code: "TRY", symbol: "₺", name: "Türk Lirası" }];
    }
    return Response.json({ currencies });
  } catch {
    return Response.json({ currencies: [{ code: "TRY", symbol: "₺", name: "Türk Lirası" }] });
  }
}
