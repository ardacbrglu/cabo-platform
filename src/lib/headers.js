/**
 * File: src/lib/headers.js
 * Purpose: Cabo security headers (CSP, HSTS) — API cevapları için.
 *
 * Security Docblock:
 * - CSP tek merkezden burada set edilir; middleware/next.config **CSP set etmez**.
 * - HSTS sadece prod + gerçek HTTPS + localhost olmayan hostlarda set edilir.
 * - Google OAuth & reCAPTCHA allowlist'i dahildir.
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
    // Common
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    // ---- CSP (idempotent) ----
    if (!res.headers.has("Content-Security-Policy")) {
      const google = [
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
        "https://www.googleapis.com",
        "https://accounts.google.com",
      ];
      const csp = [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "style-src 'self' 'unsafe-inline'",
        `script-src 'self' 'unsafe-inline' ${google.join(" ")}`,
        `connect-src 'self' ${google.join(" ")}`,
        `frame-src 'self' ${google.join(" ")}`,
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ");
      res.headers.set("Content-Security-Policy", csp);
    }

    // ---- HSTS only for real HTTPS prod ----
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
      res.headers.set("Strict-Transport-Security", `max-age=${ONE_YEAR}; includeSubDomains; preload`);
    } else {
      res.headers.delete?.("Strict-Transport-Security");
    }
  } catch {
    // header set hatalarını yut
  }
  return res;
}

export default applyApiSecurityHeaders;
