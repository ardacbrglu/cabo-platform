/**
 * File: src/lib/csrf.js
 * Purpose: Legacy import'lar için compat shim.
 *
 * Not: Cabo PROD'da API CSRF zorunlu değil; ana kontroller Origin/Referer eşleşmesi,
 * SameSite cookie, X-Requested-With ve X-Request-Id başlıklarıdır.
 * NextAuth CSRF token'ı opsiyonel header olarak taşınabilir; burada doğrulama yapmıyoruz.
 */

// Header'dan token okuma (isteğe bağlı kullanım)
export function getCsrfTokenFromHeader(req) {
  try {
    return (
      req?.headers?.get?.("x-csrf-token") ||
      req?.headers?.get?.("X-CSRF-Token") ||
      ""
    );
  } catch {
    return "";
  }
}

// No-op guard: mevcut handler'ı aynen döndürür
export function withCsrfProtection(handler /*, opts */) {
  return async (req, ctx) => handler(req, ctx);
}

// Eski kodlar için ek takma adlar (varsa farklı isimlerle çağrılıyor olabilir)
export const withCsrf = withCsrfProtection;
export function csrfMiddleware(handler, opts) { return withCsrfProtection(handler, opts); }
export function csrfGuard(handler, opts) { return withCsrfProtection(handler, opts); }

// Eski çağrılar boşa düşsün ama hata atmasın
export async function requireCsrf(/* req */) { return true; }
export async function verifyCsrf(/* req */) { return { ok: true }; }

export default {
  getCsrfTokenFromHeader,
  withCsrfProtection,
  withCsrf,
  csrfMiddleware,
  csrfGuard,
  requireCsrf,
  verifyCsrf,
};
