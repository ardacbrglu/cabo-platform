/**
 * File: src/lib/apiFetch.js
 * Purpose: Tek HTTP wrapper (Cabo PROD).
 *
 * Security Docblock:
 * - credentials:'include', X-Requested-With ve X-Request-Id otomatik.
 * - Mutasyonlarda NextAuth CSRF token (/api/auth/csrf) otomatik eklenir ve 10dk cache'lenir.
 * - FormData hariç gövde otomatik JSON.stringify edilir.
 */

let _csrf = { token: "", ts: 0 };
const CSRF_TTL = 10 * 60 * 1000; // 10 dk

async function getCsrfToken() {
  if (typeof window === "undefined") return ""; // SSR/Route içinde isteme
  const fresh = _csrf.token && Date.now() - _csrf.ts < CSRF_TTL;
  if (fresh) return _csrf.token;

  try {
    const r = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    const token = j?.csrfToken || "";
    _csrf = { token, ts: Date.now() };
    return token;
  } catch {
    _csrf = { token: "", ts: Date.now() };
    return "";
  }
}

function makeRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function apiFetch(input, init = {}) {
  const method = (init.method || "GET").toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const headers = new Headers(init.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", makeRequestId());

  // Body'yi otomatik JSON'a çevir (FormData ise dokunma)
  let body = init.body;
  if (body && typeof body !== "string" && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  // CSRF (yalnızca client + mutasyon + header yoksa)
  if (isMutation && typeof window !== "undefined" && !headers.has("X-CSRF-Token")) {
    const token = await getCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }

  return fetch(input, {
    ...init,
    method,
    headers,
    body,
    credentials: "include",
    cache: isMutation ? "no-store" : (init.cache ?? "no-store"),
  });
}

export default apiFetch;
