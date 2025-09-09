// src/lib/security.js
/**
 * Purpose: Köken doğrulama, AJAX işareti ve Request-Id zorunluluğu.
 * Notes:
 * - Mutasyonlarda (POST/PATCH/PUT/DELETE) Origin/Referer host eşleşmesi zorunlu.
 * - X-Requested-With: XMLHttpRequest zorunlu.
 * - X-Request-Id zorunlu.
 * - Prod’da env ile sınırlandır; Dev’de LAN IP/localhost toleransı + opsiyonel whitelist.
 */

function parseHostsFromEnv() {
  const list = new Set();
  const add = (u) => {
    if (!u) return;
    try { list.add(new URL(u).host); } catch {}
  };

  // Birden çok domain desteği (virgül ayraç)
  // Ör: ALLOWED_HOSTS="http://localhost:3000,http://192.168.1.105:3000"
  const multi = process.env.ALLOWED_HOSTS;
  if (multi) {
    multi.split(",").map((s) => s.trim()).forEach(add);
  } else {
    // Tekil fallback
    add(process.env.NEXTAUTH_URL);
    add(process.env.BASE_URL);
  }

  // Dev'e özel ekstra whitelist
  if (process.env.NODE_ENV !== "production") {
    const devMulti = process.env.DEV_ALLOWED_HOSTS; // "http://10.0.0.5:3000, http://192.168.1.77:3000"
    if (devMulti) devMulti.split(",").map((s) => s.trim()).forEach(add);
  }

  return Array.from(list);
}

function getForwardedOrHost(req) {
  return req.headers.get("x-forwarded-host") || req.headers.get("host") || null;
}

function hostOf(urlStr) {
  try { return new URL(urlStr).host; } catch { return null; }
}

function isMutation(method) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method?.toUpperCase?.());
}

function hostnamePart(h) {
  return String(h || "").split(":")[0];
}

function isPrivateLanHost(h) {
  const hn = hostnamePart(h);
  return (
    /^localhost$/i.test(hn) ||
    /^127\.0\.0\.1$/i.test(hn) ||
    /^10\./.test(hn) ||
    /^192\.168\./.test(hn) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hn)
  );
}

export function requireOrigin(req) {
  const method = req?.method;
  if (!isMutation(method)) return; // GET için zorunlu değil

  const allowedHosts = parseHostsFromEnv();
  const reqHost = getForwardedOrHost(req); // "192.168.1.105:3000" gibi

  // PROD: env ile belirlenmiş host(lar) zorunlu
  if (process.env.NODE_ENV === "production") {
    if (!allowedHosts.length) {
      const err = new Error("Allowed hosts not configured");
      err.status = 500;
      err.code = "HOSTS_NOT_CONFIGURED";
      throw err;
    }
  } else {
    // DEV: env boşsa isteğin geldiği host’u otomatik kabul et (kolaylık)
    if (!allowedHosts.length && reqHost) allowedHosts.push(reqHost);
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidate = hostOf(origin) || hostOf(referer); // "host:port"

  // DEV: LAN/localhost otomatik serbest (DEV_ALLOW_LAN=0 ile kapatılabilir)
  if (process.env.NODE_ENV !== "production") {
    const allowLan = (process.env.DEV_ALLOW_LAN ?? "1") !== "0";
    if (allowLan && candidate && isPrivateLanHost(candidate)) return;
  }

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
