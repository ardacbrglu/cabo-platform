// /lib/csrf.js
// SECURITY: Tüm POST/PUT/DELETE isteklerinde header + cookie eşleşmesi zorunlu.
// Header adları: x-csrf-token veya csrf-token. Cookie adı: csrf_token.

const CSRF_COOKIE_NAME = "csrf_token";

function readCookieFromHeaders(req) {
  const cookieHeader = req.headers?.get?.("cookie") || "";
  const m = cookieHeader.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function readHeaderToken(req) {
  return (
    req.headers?.get?.("x-csrf-token") ||
    req.headers?.get?.("csrf-token") ||
    null
  );
}

// Wrapper: fetch ile gönderilen mutating istekler için idealdir.
export function withCsrfProtection(handler) {
  return async function (req, ...rest) {
    const h = readHeaderToken(req);
    const c = readCookieFromHeaders(req);
    if (!h || !c || h !== c) {
      return new Response(JSON.stringify({ error: "Invalid CSRF token." }), { status: 403 });
    }
    return handler(req, ...rest);
  };
}

// Sadece doğrulamak için yardımcı (handler içinde elle çağırmak için)
export function validateCsrfToken(req) {
  const h = readHeaderToken(req);
  const c = readCookieFromHeaders(req);
  if (!h || !c || h !== c) throw new Error("Invalid CSRF token");
  return true;
}
