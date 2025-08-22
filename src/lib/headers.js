/**
 * File: src/lib/headers.js
 * Purpose: Cabo PROD güvenlik başlıkları (CSP, HSTS, vb.) — dev/staging güvenli ayar.
 *
 * Notlar:
 * - HSTS yalnızca PROD + HTTPS'te gönderilir. Localhost/127.0.0.1/.local için asla.
 * - CSP sade bir default ile gelir; gerekirse genişlet.
 */

const ONE_YEAR = 31536000;

function isLocalhostHost(host = "") {
  return (
    /^localhost(?::\d+)?$/i.test(host) ||
    /^127\.0\.0\.1(?::\d+)?$/i.test(host) ||
    /\.local(?::\d+)?$/i.test(host)
  );
}

export function applyApiSecurityHeaders(res, req /* optional */) {
  try {
    // Ortak başlıklar
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("X-Frame-Options", "DENY");
    // Çok kısıtlı Permissions-Policy (isteğe göre genişlet)
    res.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), interest-cohort=()"
    );

    // Basit CSP (UI’nı bozmayacak minimum)
    // İhtiyaca göre img-src cdn vs. ekleyebilirsin.
    if (!res.headers.has("Content-Security-Policy")) {
      res.headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "img-src 'self' data: blob:",
          "style-src 'self' 'unsafe-inline'",
          "script-src 'self' 'unsafe-inline'",
          "connect-src 'self'",
          "font-src 'self' data:",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; ")
      );
    }

    // ---- HSTS sadece PROD + HTTPS ----
    const isProd = process.env.NODE_ENV === "production";
    let scheme = "http";
    let host = "";

    if (req) {
      scheme =
        req.headers?.get?.("x-forwarded-proto") ||
        (req.url ? new URL(req.url).protocol.replace(":", "") : "http");
      host = req.headers?.get?.("x-forwarded-host") || req.headers?.get?.("host") || "";
    }

    const onHttps = scheme === "https";
    const localhostLike = isLocalhostHost(host);

    if (isProd && onHttps && !localhostLike) {
      // Sadece gerçek prod TLS altında
      res.headers.set(
        "Strict-Transport-Security",
        `max-age=${ONE_YEAR}; includeSubDomains; preload`
      );
    } else {
      // Local/staging’de asla HSTS gönderme
      if (res.headers.has("Strict-Transport-Security")) {
        res.headers.delete("Strict-Transport-Security");
      }
    }
  } catch {
    // header set’lerinde sessiz kal
  }
  return res;
}

export default applyApiSecurityHeaders;
