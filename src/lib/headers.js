/**
 * File: src/lib/headers.js
 * Purpose: API yanıtlarına güvenlik başlıkları eklemek.
 * Security Notes:
 * - API için temel başlıklar: nosniff, referrer-policy, CORP/COOP.
 * - HSTS prod ortamda zorunlu.
 * - CSP sayfa render’ında/middleware’de yönetilir; API için minimalist ilke.
 */

export function applyApiSecurityHeaders(res) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
}
