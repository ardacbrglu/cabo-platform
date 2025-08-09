// /lib/csrf.js
// SECURITY: Tüm mutating (POST/PUT/PATCH/DELETE) isteklerde header + cookie eşleşmesi zorunlu.
// Header adları: x-csrf-token | csrf-token | x-xsrf-token
// Cookie adı: csrf_token

import crypto from "crypto";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAMES = ["x-csrf-token", "csrf-token", "x-xsrf-token"];
const HEX64 = /^[a-f0-9]{64}$/i;

function getMethod(req) {
  // Next Request destekler: req.method
  return (req?.method || "GET").toUpperCase();
}

function getHeader(req, name) {
  return req?.headers?.get?.(name) || null;
}

export function readCookieFromHeaders(req) {
  const cookieHeader = getHeader(req, "cookie") || "";
  // Güvenli, hedefe özel eşleşme
  const m = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`)
  );
  return m ? decodeURIComponent(m[1]) : null;
}

export function readHeaderToken(req) {
  for (const n of CSRF_HEADER_NAMES) {
    const v = getHeader(req, n);
    if (v) return v;
  }
  return null;
}

function isTokenFormatValid(t) {
  if (typeof t !== "string") return false;
  const s = t.trim();
  return HEX64.test(s);
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  // Timing-safe için length aynı olmalı
  if (a.length !== b.length) return false;
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * validateCsrfToken(req, opts?)
 * opts.methods: Zorunlu kılınacak HTTP method seti (varsayılan: POST,PUT,PATCH,DELETE)
 * GET/HEAD/OPTIONS için default olarak doğrulama yapılmaz (preflight ve idempotent istekler).
 */
export function validateCsrfToken(req, opts = {}) {
  const method = getMethod(req);
  const enforceOn = new Set(opts.methods || ["POST", "PUT", "PATCH", "DELETE"]);

  // Mutating değilse zorunlu kılma
  if (!enforceOn.has(method)) return true;

  const h = (readHeaderToken(req) || "").trim();
  const c = (readCookieFromHeaders(req) || "").trim();

  // Header+cookie şart
  if (!h || !c) throw new Error("Invalid CSRF token");

  // Biçim kontrolü (crypto.randomBytes(32).toString('hex') = 64 hex)
  if (!isTokenFormatValid(h) || !isTokenFormatValid(c)) {
    throw new Error("Invalid CSRF token");
  }

  // Timing-safe karşılaştırma
  if (!safeEqual(h, c)) throw new Error("Invalid CSRF token");

  return true;
}

/**
 * withCsrfProtection(handler, opts?)
 * - Varsayılan: yalnız mutating method’larda doğrular.
 * - Hata durumunda 403 JSON döner, cache devre dışı.
 * - Geriye dönük uyum: opts verilmezse eski kullanım devam eder.
 */
export function withCsrfProtection(handler, opts = {}) {
  return async function (req, ...rest) {
    try {
      validateCsrfToken(req, opts);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid CSRF token." }), {
        status: 403,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }
    return handler(req, ...rest);
  };
}
