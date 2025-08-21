/**
 * File: src/lib/apiFetch.js
 * Purpose: Tek HTTP wrapper (Cabo PROD).
 *
 * Özellikler:
 * - credentials: 'include'
 * - X-Requested-With, X-Request-Id otomatik
 * - Body (object) -> JSON.stringify (FormData'ya dokunmaz)
 * - Mutasyonlarda (POST/PUT/PATCH/DELETE) NextAuth CSRF token'ı otomatik alır (/api/auth/csrf) ve 10dk cache'ler
 * - SSR güvenli: window yoksa CSRF istenmez
 */

let _csrf = { token: "", ts: 0 };
const CSRF_TTL = 10 * 60 * 1000; // 10 dk

async function getCsrfToken() {
  if (typeof window === "undefined") return ""; // SSR/Route içinde dokunma
  const fresh = _csrf.token && Date.now() - _csrf.ts < CSRF_TTL;
  if (fresh) return _csrf.token;

  try {
    const r = await fetch("/api/auth/csrf", { credentials: "include" });
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
    // modern
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  // fallback
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
    cache: isMutation ? "no-store" : init.cache,
  });
}

export default apiFetch;
