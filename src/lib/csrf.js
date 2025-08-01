// src/lib/csrf.js

/**
 * Handler ile birlikte kullanılmak için CSRF middleware (örnek kullanım: csrf(handler))
 */
export function csrf(handler) {
  return async function (req) {
    const tokenFromHeader = req.headers.get("x-csrf-token");
    const expected = process.env.CSRF_SECRET || "CSRF_SECRET_DEFAULT";

    if (!tokenFromHeader || tokenFromHeader !== expected) {
      return new Response(JSON.stringify({
        success: false,
        message: "Invalid CSRF token."
      }), { status: 403 });
    }

    return handler(req);
  };
}

/**
 * Sadece CSRF token doğrulamak için standalone fonksiyon.
 * Route fonksiyonunun başında kullanılabilir.
 * Hatalıysa: throw Error at!
 */
export function validateCsrfToken(req) {
  const tokenFromHeader =
    (req.headers && req.headers.get && req.headers.get("x-csrf-token")) ||
    (req.headers && req.headers["x-csrf-token"]) ||
    null;
  const expected = process.env.CSRF_SECRET || "CSRF_SECRET_DEFAULT";
  if (!tokenFromHeader || tokenFromHeader !== expected) {
    throw new Error("Invalid CSRF token.");
  }
  return true;
}
