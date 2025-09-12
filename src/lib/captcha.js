/**
 * reCAPTCHA v2 server verify
 * - PROD: gerçek secret zorunlu
 * - DEV: host local/LAN ise veya secret yoksa TEST SECRET kullan
 */

const TEST_SECRET = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

function isLocalLikeHost(h = "") {
  const hn = String(h || "").split(":")[0];
  return (
    /^localhost$/i.test(hn) ||
    /^127\./.test(hn) ||
    /^10\./.test(hn) ||
    /^192\.168\./.test(hn) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hn)
  );
}

export async function verifyRecaptcha(token, { forceTest = false } = {}) {
  const isProd = process.env.NODE_ENV === "production";
  let secret = process.env.RECAPTCHA_SECRET_KEY || "";
  if (!isProd && (forceTest || !secret)) secret = TEST_SECRET;

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
      // diğer endpoint'e geç
    }
  }
  return { ok: false, code: "NETWORK" };
}

export async function verifyRecaptchaFromRequest(req, token) {
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "";
  const forceTest = process.env.NODE_ENV !== "production" && isLocalLikeHost(host);
  const out = await verifyRecaptcha(token, { forceTest });
  return out.ok;
}
