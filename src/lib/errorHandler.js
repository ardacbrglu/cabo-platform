// /src/lib/errorHandler.js  (veya mevcut dosyan)
import { NextResponse } from "next/server";

export function handleApiError(err, status = 500, exposeMessage = false) {
  console.error(err);
  const message =
    exposeMessage && typeof err?.message === "string"
      ? err.message
      : "Internal server error";
  return NextResponse.json({ error: message }, { status });
}
