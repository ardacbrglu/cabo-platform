// src/lib/csrf.js

/**
 * Handler ile birlikte kullanılmak için CSRF middleware (örnek kullanım: csrf(handler))
 */
// SECURITY REVIEW: Using a fallback secret (CSRF_SECRET_DEFAULT) is NOT safe for production.
// Always set a strong, unpredictable CSRF_SECRET in your environment variables.
// Consider rotating secrets periodically and monitoring for secret leakage.
export function csrf(handler) {
  return async function (req) {
    const tokenFromHeader = req.headers.get("x-csrf-token");
    const expected = process.env.CSRF_SECRET || "CSRF_SECRET_DEFAULT";

    if (!tokenFromHeader || tokenFromHeader !== expected) {
      // SECURITY REVIEW: Responds with generic error. Consider logging failed attempts for monitoring.
      return new Response(JSON.stringify({ error: 'Invalid CSRF token.' }), { status: 403 });
    }

    return handler(req);
  };
}

/**
 * Sadece CSRF token doğrulamak için standalone fonksiyon.
 * Route fonksiyonunun başında kullanılabilir.
 * Hatalıysa: throw Error at!
 */
// SECURITY REVIEW: Same static token check as above. See notes above for improvements.
export function validateCsrfToken(req) {
  const tokenFromHeader =
    (req.headers && req.headers.get && req.headers.get("x-csrf-token")) ||
    (req.headers && req.headers["x-csrf-token"]) ||
    null;
  const expected = process.env.CSRF_SECRET || "CSRF_SECRET_DEFAULT";
  if (!tokenFromHeader || tokenFromHeader !== expected) {
    // SECURITY REVIEW: Consider logging details of failed CSRF attempts for audit.
    throw new Error('Invalid CSRF token');
  }
  return true;
}
