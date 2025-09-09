// lib/captcha.js
/**
 * reCAPTCHA v2 server verify helpers (Node/Edge)
 */

export async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: false, code: "SECRET_MISSING" };
  if (!token) return { ok: false, code: "TOKEN_MISSING" };

  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);

  const endpoints = [
    "https://www.google.com/recaptcha/api/siteverify",
    "https://www.recaptcha.net/recaptcha/api/siteverify",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (data?.success === true) return { ok: true, raw: data };
      const code = Array.isArray(data?.["error-codes"]) ? data["error-codes"][0] : "VERIFY_FAILED";
      return { ok: false, code, raw: data || null };
    } catch {
      // sonraki endpoint denenir
    }
  }
  return { ok: false, code: "NETWORK" };
}

export async function verifyRecaptchaFromRequest(_req, token) {
  const out = await verifyRecaptcha(token);
  return out.ok;
}
