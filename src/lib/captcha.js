/**
 * Server-side reCAPTCHA doğrulaması (v2 & v3).
 * ENV:
 *   RECAPTCHA_SECRET_KEY
 *   NEXT_PUBLIC_RECAPTCHA_MODE = "v2" | "v3"
 *   RECAPTCHA_MIN_SCORE (ops, v3 için, vars: 0.5)
 *   RECAPTCHA_BYPASS_DEV=1  // sadece development’ta kolay test
 */
export async function verifyRecaptcha(token, remoteIp) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  const mode = (process.env.NEXT_PUBLIC_RECAPTCHA_MODE || "v2").toLowerCase();

  if (process.env.NODE_ENV !== "production" && process.env.RECAPTCHA_BYPASS_DEV === "1") {
    return { ok: true, raw: { devBypass: true } };
  }
  if (!secret || !token) return { ok: false };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.success) return { ok: false, raw: data };

    if (mode === "v3") {
      const min = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);
      return { ok: (data.score ?? 0) >= min, raw: data };
    }
    return { ok: true, raw: data };
  } catch {
    return { ok: false };
  }
}

// İstekten IP alıp verify’e geçirmen kolay olsun diye bir yardımcı:
export function clientIpFromRequest(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || undefined;
}

// Örnek kullanım (API route içinde):
// const ok = await verifyRecaptcha(body.captcha, clientIpFromRequest(req));
