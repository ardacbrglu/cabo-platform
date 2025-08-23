// src/lib/apiFetch.js
/**
 * File: src/lib/apiFetch.js
 * Purpose: Tek HTTP wrapper (Cabo PROD).
 *
 * Security Docblock:
 * - credentials:'include', X-Requested-With ve X-Request-Id otomatik eklenir.
 * - Mutasyonlarda NextAuth CSRF token (/api/auth/csrf) otomatik eklenir ve 10dk cache'lenir.
 * - 429 (Too Many Requests): Retry-After saniyesi kadar **sessizce** bekler, tek kez yeniden dener.
 *   Kullanıcıya toast/log göstermez.
 * - 401/403: Bulunduğunuz alana göre doğru login sayfasına yönlendirir (merchant vs affiliate).
 * - Body: FormData değilse otomatik JSON.stringify + Content-Type: application/json.
 * - Geri dönüş: Orijinal Response nesnesi (mevcut çağrılar kırılmaz).
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

  const reqInit = {
    ...init,
    method,
    headers,
    body,
    credentials: "include",
    cache: isMutation ? "no-store" : (init.cache ?? "no-store"),
    redirect: init.redirect || "follow",
  };

  async function exec() {
    return fetch(input, reqInit);
  }

  // İlk deneme
  let res = await exec();

  // 429 ise: Retry-After kadar sessiz bekle + tek retry
  if (res.status === 429) {
    const ra = parseInt(res.headers.get("Retry-After") || "0", 10);
    const waitMs = ((Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) : 1) * 1000) + Math.floor(Math.random() * 250);
    await sleep(waitMs);
    res = await exec();
  }

  // 401/403 → doğru login’e yönlendir
  if (typeof window !== "undefined" && (res.status === 401 || res.status === 403)) {
    const path = window.location?.pathname || "";
    const to = path.startsWith("/merchant") ? "/merchant/login" : "/login";
    const url = new URL(to, window.location.origin);
    url.searchParams.set("callbackUrl", window.location.href);
    try { window.location.replace(url.toString()); } catch { window.location.href = url.toString(); }
  }

  return res; // Mevcut kullanım şekilleri bozulmasın
}

export default apiFetch;
