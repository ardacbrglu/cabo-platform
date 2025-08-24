// src/lib/security.js
/**
 * Purpose: Köken doğrulama, AJAX işareti ve Request-Id zorunluluğu.
 * Notes:
 * - Mutasyonlarda (POST/PATCH/PUT/DELETE) Origin/Referer host eşleşmesi zorunlu.
 * - X-Requested-With: XMLHttpRequest zorunlu.
 * - X-Request-Id zorunlu.
 * - Prod’da Host spoofing riskine karşı env zorunlu; dev’de toleranslı.
 */

function parseHostsFromEnv() {
  const list = new Set();
  const add = (u) => {
    if (!u) return;
    try { list.add(new URL(u).host); } catch {}
  };
  // Birden çok domain için destek
  const multi = process.env.ALLOWED_HOSTS; // "https://a.com,https://b.com,http://localhost:3000"
  if (multi) {
    multi.split(",").map((s) => s.trim()).forEach(add);
  } else {
    add(process.env.NEXTAUTH_URL);
    add(process.env.BASE_URL);
  }
  return Array.from(list);
}

function getForwardedOrHost(req) {
  // Proxy arkasında doğru host
  return req.headers.get("x-forwarded-host") || req.headers.get("host") || null;
}

function hostOf(urlStr) {
  try { return new URL(urlStr).host; } catch { return null; }
}

export function isMutation(method) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method?.toUpperCase?.());
}

export function requireOrigin(req) {
  const method = req?.method;
  if (!isMutation(method)) return; // GET için Origin şart değil (öneri: API'lerinde yine de çağırabilirsin)

  const allowedHosts = parseHostsFromEnv();
  const reqHost = getForwardedOrHost(req);

  // PROD: env ile belirlenmiş host(lar) zorunlu
  if (process.env.NODE_ENV === "production") {
    if (!allowedHosts.length) {
      const err = new Error("Allowed hosts not configured");
      err.status = 500;
      err.code = "HOSTS_NOT_CONFIGURED";
      throw err;
    }
  } else {
    // DEV: env boşsa request host’u allow list’e ekle (tolerans)
    if (!allowedHosts.length && reqHost) allowedHosts.push(reqHost);
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidate = hostOf(origin) || hostOf(referer);

  const ok = candidate && allowedHosts.includes(candidate);
  if (!ok) {
    const err = new Error("Invalid origin/referer");
    err.status = 403;
    err.code = "BAD_ORIGIN";
    throw err;
  }
}

export function requireAjax(req) {
  const xrw = req.headers.get("x-requested-with");
  if (xrw !== "XMLHttpRequest") {
    const err = new Error("Missing X-Requested-With");
    err.status = 400;
    err.code = "MISSING_X_REQUESTED_WITH";
    throw err;
  }
}

export function requireRequestId(req) {
  const rid = req.headers.get("x-request-id");
  if (!rid) {
    const err = new Error("Missing X-Request-Id");
    err.status = 400;
    err.code = "MISSING_REQUEST_ID";
    throw err;
  }
  return rid;
}
