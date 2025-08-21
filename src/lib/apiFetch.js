/**
 * File: src/lib/apiFetch.js
 * Purpose: Tüm frontend istekleri için tek fetch wrapper (UI korunur).
 * Security Notes:
 * - X-Requested-With ve X-Request-Id otomatik eklenir.
 * - credentials: include (SameSite Lax/Strict çerezler için).
 * - Gerekirse ileride X-CSRF-Token eklenebilir (NextAuth /api/auth/csrf).
 */

import { v4 as uuid } from "uuid";

export async function apiFetch(url, { method = "GET", headers = {}, body } = {}) {
  const reqId = uuid();
  const h = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-Request-Id": reqId,
    ...headers,
  };
  return fetch(url, {
    method,
    headers: h,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
}
