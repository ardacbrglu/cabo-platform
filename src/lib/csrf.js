/**
 * File: src/lib/csrf.js
 * Purpose: Legacy import'lar için compat shim.
 * Not: Cabo PROD'da API CSRF zorunlu değil; asıl kontroller Origin/Referer, SameSite ve özel header'lardır.
 *      NextAuth CSRF token'ı opsiyonel header olarak taşınabilir; burada doğrulama yapılmaz.
 */

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

// Eski kodlar çağırıyorsa boşa düşsün ama hata atmasın:
export async function requireCsrf(/* req */) {
  return true;
}

export async function verifyCsrf(/* req */) {
  return { ok: true };
}

export default { getCsrfTokenFromHeader, requireCsrf, verifyCsrf };
