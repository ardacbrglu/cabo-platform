/**
 * File: src/lib/apiFetch.js
 * Purpose: Tek HTTP wrapper (Cabo PROD).
 *
 * Security Docblock:
 * - credentials:'include', X-Requested-With ve X-Request-Id otomatik eklenir.
 * - Mutasyonlarda NextAuth CSRF token (/api/auth/csrf) otomatik eklenir ve 10dk cache'lenir.
 * - 429 (Too Many Requests): Retry-After saniyesi kadar sessizce bekler, tek kez yeniden dener.
 * - 401/403: Bulunduğunuz alana göre doğru login sayfasına yönlendirir (opsiyonel kapatma: init.noAuthRedirect === true).
 * - Body: FormData değilse otomatik JSON.stringify + Content-Type: application/json.
 * - Dönüş: Orijinal Response nesnesi.
 */

let _csrf = { token: "", ts: 0 };
const CSRF_TTL = 10 * 60 * 1000; // 10 dk

function escapeForRegex(name) {
  // cookie adındaki . [ ] ( ) ? + * vs. regex karakterlerini kaçır
  return name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function getCookie(name) {
  if (typeof document === "undefined") return "";
  const esc = escapeForRegex(name);
  const re = new RegExp(`(?:^|;\\s*)${esc}=([^;]*)`);
  const m = document.cookie.match(re);
  return m ? decodeURIComponent(m[1]) : "";
}

async function getCsrfToken() {
  if (typeof window === "undefined") return ""; // SSR'de isteme

  // 1) Çerezden hızlı okuma (NextAuth iki isim de kullanabiliyor)
  const cookieRaw =
    getCookie("__Host-next-auth.csrf-token") || getCookie("next-auth.csrf-token");
  if (cookieRaw) {
    const token = cookieRaw.split("|")[0] || cookieRaw;
    _csrf = { token, ts: Date.now() };
    return token;
  }

  // 2) Cache tazeyse onu ver
  const fresh = _csrf.token && Date.now() - _csrf.ts < CSRF_TTL;
  if (fresh) return _csrf.token;

  // 3) Endpoint'ten çek
  try {
    const r = await fetch("/api/auth/csrf", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
    });
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

  // Body -> JSON (FormData ise dokunma)
  let body = init.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (method === "GET" || method === "HEAD") {
    body = undefined; // safety
  } else if (body != null && typeof body !== "string" && !isFormData) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    try {
      body = JSON.stringify(body);
    } catch {
      body = String(body);
    }
  } else if (isFormData) {
    // FormData ise Content-Type'ı fetch kendi set eder
    if (headers.has("Content-Type")) headers.delete("Content-Type");
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
    mode: init.mode || "same-origin",
  };

  const exec = () => fetch(input, reqInit);

  // İlk deneme
  let res = await exec();

  // 429 ise: Retry-After kadar sessiz bekle + tek retry
  if (res.status === 429) {
    const ra = parseInt(res.headers.get("Retry-After") || "0", 10);
    const waitMs =
      ((Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) : 1) * 1000) +
      Math.floor(Math.random() * 250);
    await sleep(waitMs);
    res = await exec();
  }

  // 401/403 → uygun login sayfasına yönlendir (opsiyonel kapatma)
  const noAuthRedirect = !!init.noAuthRedirect;
  if (typeof window !== "undefined" && (res.status === 401 || res.status === 403) && !noAuthRedirect) {
    const loc = window.location || {};
    const herePath = loc.pathname || "";
    const inputStr = typeof input === "string" ? input : "";

    // Auth endpointlerinden gelen 401/403'te ya da zaten login sayfasındayken redirect döngüsünü engelle
    const isAuthEndpoint =
      /^\/api\/auth\//i.test(inputStr) ||
      /\/api\/merchant_login/i.test(inputStr) ||
      /\/api\/login/i.test(inputStr);
    const alreadyOnLogin = /^\/(merchant\/)?login(?:\/|$)/i.test(herePath);

    if (!isAuthEndpoint && !alreadyOnLogin) {
      const isMerchantArea =
        herePath.startsWith("/merchant") || /\/api\/merchant_/i.test(inputStr);
      const to = isMerchantArea ? "/merchant/login" : "/login";
      const url = new URL(to, loc.origin || window.location.origin);
      url.searchParams.set("callbackUrl", window.location.href);
      try { window.location.replace(url.toString()); }
      catch { window.location.href = url.toString(); }
    }
  }

  return res;
}

export default apiFetch;
