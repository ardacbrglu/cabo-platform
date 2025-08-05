// src/lib/csrf.js

const CSRF_COOKIE_NAME = "csrf_token";

/**
 * CSRF token doğrulaması yapan middleware
 * 
 * KULLANIM: export const POST = csrf(async (req) => { ... });
 */
export function csrf(handler) {
  return async function (req) {
    // 1. Header veya body'den token'ı oku
    const tokenFromHeader =
      req.headers.get("x-csrf-token") ||
      req.headers.get("csrf-token") ||
      (req.body && req.body.csrf_token) ||
      null;

    // 2. Cookie'den token'ı oku
    let tokenFromCookie = null;
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/csrf_token=([^;]+)/); // snake_case
    if (match) tokenFromCookie = match[1];

    // 3. Eşleşme kontrolü
    if (!tokenFromHeader || !tokenFromCookie || tokenFromHeader !== tokenFromCookie) {
      return new Response(JSON.stringify({ error: 'Invalid CSRF token.' }), { status: 403 });
    }

    // 4. Tokenlar doğruysa, gerçek handler çalıştırılır
    return handler(req);
  };
}

/**
 * Sadece CSRF token doğrulamak için standalone fonksiyon.
 * Route fonksiyonunun başında kullanılabilir.
 * Hatalıysa: throw Error at!
 */
export function validatecsrf_token(req) {
  const tokenFromHeader =
    (req.headers && req.headers.get && (req.headers.get("x-csrf-token") || req.headers.get("csrf-token"))) ||
    (req.headers && req.headers["x-csrf-token"]) ||
    (req.body && req.body.csrf_token) ||
    null;

  // Cookie'den oku
  let tokenFromCookie = null;
  const cookieHeader = req.headers?.get?.("cookie") || req.headers?.cookie || "";
  const match = cookieHeader.match(/csrf_token=([^;]+)/);
  if (match) tokenFromCookie = match[1];

  if (!tokenFromHeader || !tokenFromCookie || tokenFromHeader !== tokenFromCookie) {
    throw new Error('Invalid CSRF token');
  }
  return true;
}
