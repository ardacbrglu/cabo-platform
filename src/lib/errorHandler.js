/**
 * File: src/lib/errorHandler.js
 * Purpose: API rotaları için tek tip JSON hata yanıtlama yardımcıları.
 * Security Notes:
 * - Hata gövdeleri { error, request_id, retry_after? } sözleşmesine uyar.
 * - 429 yanıtlarında Retry-After başlığı zorunlu.
 */

import { NextResponse } from "next/server";
import { applyApiSecurityHeaders } from "@/lib/headers";

export function jsonError(message, { status = 400, requestId, retryAfterSeconds } = {}) {
  const body = { error: String(message || "error") };
  if (requestId) body.request_id = requestId;
  if (retryAfterSeconds) body.retry_after = retryAfterSeconds;

  const res = NextResponse.json(body, { status });
  if (retryAfterSeconds) res.headers.set("Retry-After", String(retryAfterSeconds));
  res.headers.set("Cache-Control", "no-store");
  return applyApiSecurityHeaders(res);
}
