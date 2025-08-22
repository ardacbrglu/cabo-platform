/**
 * Cabo security headers (CSP, HSTS).
 * Safe defaults + allowlist for Google reCAPTCHA & OAuth.
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
    res.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );

    // ---- CSP ----
    // NOTE: We must allow Google domains for reCAPTCHA & Google OAuth.
    const google = [
      "https://www.google.com",
      "https://www.gstatic.com",
      "https://www.recaptcha.net",
      "https://www.googleapis.com",
      "https://accounts.google.com",
    ];

    if (!res.headers.has("Content-Security-Policy")) {
      const csp = [
        "default-src 'self'",
        // images (recaptcha ve oauth görselleri için https: da serbest bırakıyoruz)
        "img-src 'self' data: blob: https:",
        // inline küçük stiller gerekiyor
        "style-src 'self' 'unsafe-inline'",
        // reCAPTCHA & OAuth scriptleri
        `script-src 'self' 'unsafe-inline' ${google.join(" ")}`,
        // XHR/fetch endpoints (recaptcha beacon & oauth)
        `connect-src 'self' ${google.join(" ")}`,
        // reCAPTCHA (v2) ve Google OAuth pencere/iframe’leri
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
      host =
        req.headers?.get?.("x-forwarded-host") ||
        req.headers?.get?.("host") ||
        "";
    }

    const onHttps = scheme === "https";
    const localhostLike = isLocalhostHost(host);

    if (isProd && onHttps && !localhostLike) {
      res.headers.set(
        "Strict-Transport-Security",
        `max-age=${ONE_YEAR}; includeSubDomains; preload`
      );
    } else {
      res.headers.delete?.("Strict-Transport-Security");
    }
  } catch {
    // ignore header set errors
  }
  return res;
}

export default applyApiSecurityHeaders;
