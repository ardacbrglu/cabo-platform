// Server-side Google reCAPTCHA verification (v2 checkbox & v3)
//
// Security:
// - Uses only server-side secret (RECAPTCHA_SECRET_KEY). No secrets on client.
// - Optional dev bypass: NODE_ENV!=="production" && RECAPTCHA_BYPASS_DEV==="1".
// - Short network timeout; does not log PII by default.

const MODE = (process.env.NEXT_PUBLIC_RECAPTCHA_MODE || "v2").toLowerCase();
const SECRET = process.env.RECAPTCHA_SECRET_KEY;
const MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);

export function clientIpFromRequest(req) {
  const fwd = req?.headers?.get?.("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || undefined;
}

/**
 * Low-level verify: returns { ok, raw }
 */
export async function verifyRecaptcha(token, remoteIp) {
  // Dev bypass (only non-production)
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.RECAPTCHA_BYPASS_DEV === "1"
  ) {
    return { ok: true, raw: { devBypass: true } };
  }

  if (!SECRET || !token) return { ok: false, raw: { reason: "missing" } };

  const body = new URLSearchParams({ secret: SECRET, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));
    if (!data?.success) return { ok: false, raw: data };

    if (MODE === "v3") {
      const ok = (data.score ?? 0) >= MIN_SCORE;
      return { ok, raw: data };
    }
    return { ok: true, raw: data }; // v2
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, raw: { error: "network", detail: String(e?.message || e) } };
  }
}

/**
 * Convenience helper for API routes
 */
export async function verifyRecaptchaFromRequest(req, token) {
  const ip = clientIpFromRequest(req);
  const { ok } = await verifyRecaptcha(token, ip);
  return ok;
}
