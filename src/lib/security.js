/**
 * File: src/lib/security.js
 * Purpose: Köken doğrulama, AJAX işareti ve Request-Id zorunluluğu.
 * Security Notes:
 * - Mutasyonlarda (POST/PATCH/PUT/DELETE) Origin/Referer host eşleşmesi zorunlu.
 * - X-Requested-With: XMLHttpRequest zorunlu.
 * - X-Request-Id zorunlu (tekrar oynatma, korelasyon).
 */

function getAllowedHost() {
  const base = process.env.NEXTAUTH_URL || process.env.BASE_URL || "";
  try { return new URL(base).host; } catch { return null; }
}

function hostOf(urlStr) {
  try { return new URL(urlStr).host; } catch { return null; }
}

export function isMutation(method) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method?.toUpperCase?.());
}

export function requireOrigin(req) {
  const method = req?.method;
  if (!isMutation(method)) return; // GET için Origin zorunlu değil

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const hostHdr = req.headers.get("host");
  const allowed = getAllowedHost() || hostHdr;

  const ok =
    (origin && hostOf(origin) === allowed) ||
    (referer && hostOf(referer) === allowed);

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
