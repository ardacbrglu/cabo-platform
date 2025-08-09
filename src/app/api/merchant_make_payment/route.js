export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit, makeRateLimitKey, logApiEvent } from "@/lib/ratelimit";
import { requireRole } from "@/lib/access";
import { z } from "zod";

const BodySchema = z.object({
  itemIds: z
    .array(
      z.union([
        z.number().int().positive(),
        z
          .string()
          .regex(/^\d+$/)
          .transform((s) => Number(s)),
      ])
    )
    .min(1, "At least one item is required")
    .max(200, "Too many items") // makul bir üst sınır
});

export async function POST(req) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  // 1) Rate limit (merchant başı 10/dk)
  const rlKey = makeRateLimitKey(req, { scope: "merchant-mark-paid" });
  const { ok, resetMs } = await checkRateLimit({
    key: rlKey,
    limit: 10,
    windowMs: 60_000,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } }
    );
  }

  try {
    // 2) CSRF
    await validateCsrfToken(req);

    // 3) Session & rol
    const session = await getServerSession(authOptions);
    const user = session?.user;
    requireRole(user, "merchant");
    if (user.status !== "active") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4) Payload doğrulama
    const body = await req.json();
    const { itemIds } = BodySchema.parse(body);

    // 5) Yalnızca ilgili merchant’a ait ve pending olan item’ları çek
    const eligible = await prisma.payoutRequestItem.findMany({
      where: {
        itemId: { in: itemIds },
        merchantId: user.id,
        status: "pending",
        payoutRequest: { status: "pending" },
      },
      select: { itemId: true, requestId: true },
    });

    if (eligible.length === 0) {
      return NextResponse.json(
        { error: "No valid items to mark as paid" },
        { status: 400 }
      );
    }

    const ids = eligible.map((i) => i.itemId);
    const now = new Date();

    // 6) Tek transaction: update + log
    await prisma.$transaction([
      prisma.payoutRequestItem.updateMany({
        where: { itemId: { in: ids } },
        data: { status: "merchant_paid", paidAt: now },
      }),
      prisma.payoutRequestLog.createMany({
        data: eligible.map((i) => ({
          itemId: i.itemId,
          requestId: i.requestId,
          userId: user.id,
          action: "merchant_paid",
          oldStatus: "pending",
          newStatus: "merchant_paid",
          note: "Merchant marked as paid",
          createdAt: now,
        })),
      }),
    ]);

    await logApiEvent({
      endpoint: "merchant-mark-paid",
      ip,
      ua,
      event: "ok",
      email: null,
    });

    return NextResponse.json({ success: true, updated: ids, count: ids.length });
  } catch (err) {
    await logApiEvent({
      endpoint: "merchant-mark-paid",
      ip,
      ua,
      event: "error",
      error: err?.message || String(err),
    });

    // Zod veya CSRF hatası → 400/403
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    if (String(err?.message || "").includes("CSRF")) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }
    if (err?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err?.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
