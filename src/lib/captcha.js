// /lib/captcha.js
/**
 * Server-side CAPTCHA verify helper (Turnstile veya reCAPTCHA v2/v3)
 *
 * Env:
 *   CAPTCHA_PROVIDER=turnstile | recaptcha         (default: recaptcha)
 *   TURNSTILE_SECRET=********************************
 *   RECAPTCHA_SECRET=********************************
 *   RECAPTCHA_MIN_SCORE=0.5   // sadece v3 için, opsiyonel
 *
 * Kullanım:
 *   const { ok } = await verifyCaptchaServer({ token, ip });
 */

export async function verifyCaptchaServer({ token, ip }) {
  const provider = String(process.env.CAPTCHA_PROVIDER || "recaptcha").toLowerCase();
  const minScore =
    Number.isFinite(Number(process.env.RECAPTCHA_MIN_SCORE))
      ? Number(process.env.RECAPTCHA_MIN_SCORE)
      : 0.5;

  if (!token) return { ok: false, reason: "missing_token" };

  const secret =
    provider === "turnstile"
      ? process.env.TURNSTILE_SECRET
      : process.env.RECAPTCHA_SECRET;

  // Dev ortamında secret yoksa bypass edelim (prod'da zorunlu ayarla)
  if (!secret) return { ok: true, devBypass: true };

  const endpoint =
    provider === "turnstile"
      ? "https://challenges.cloudflare.com/turnstile/v0/siteverify"
      : "https://www.google.com/recaptcha/api/siteverify";

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({}));

    if (provider === "turnstile") {
      return { ok: !!data?.success, raw: data };
    } else {
      // reCAPTCHA v2: success boolean, v3: success + score
      const ok = !!data?.success && (typeof data?.score !== "number" || data.score >= minScore);
      return { ok, score: data?.score, action: data?.action, raw: data };
    }
  } catch (e) {
    return { ok: false, reason: "verify_failed" };
  }
}
