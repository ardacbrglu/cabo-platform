/**
 * reCAPTCHA v2 server verify (Prod-Ready)
 *
 * Security Docblock
 * - PRODUCTION: Yalnızca RECAPTCHA_SECRET_KEY (env) ile doğrula. Secret kodda asla gömülü değil.
 * - NON-PROD: İki seçenek:
 *     (a) TEST modu: RECAPTCHA_MODE=test ise RECAPTCHA_TEST_SECRET (env) kullanılır.
 *     (b) DEV BYPASS (opsiyonel): RECAPTCHA_DEV_BYPASS=1 ise ve host local/LAN ise doğrulamayı geç.
 * - Hiçbir durumda secret literal olarak repoya girmez -> Gitleaks pozitifini engeller.
 * - Tüm yanıtlar "no-store" ile istenir; iki endpoint ile yedekli doğrulama yapılır.
 */

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

const RECAPTCHA_ENDPOINTS = [
  "https://www.google.com/recaptcha/api/siteverify",
  "https://www.recaptcha.net/recaptcha/api/siteverify",
];

function pickSecret(host = "") {
  const isProd = process.env.NODE_ENV === "production";
  const fromEnv = (k) => (process.env[k] || "").trim();

  // PROD: yalnız gerçek secret geçerli
  if (isProd) {
    const prodSecret = fromEnv("RECAPTCHA_SECRET_KEY");
    if (!prodSecret) return { error: "SECRET_MISSING" };
    return { secret: prodSecret };
  }

  // NON-PROD
  const mode = fromEnv("RECAPTCHA_MODE").toLowerCase(); // "test" | "" (default)
  if (mode === "test") {
    // Test secret env'den okunur (literal YOK!)
    const testSecret = fromEnv("RECAPTCHA_TEST_SECRET");
    if (testSecret) return { secret: testSecret, mode: "test" };
    // test modu istendi ama secret yoksa normal akışa düşme, açıkça hata verelim:
    return { error: "TEST_SECRET_MISSING" };
  }

  // Opsiyonel DEV bypass (yalnız local/LAN host’larda)
  const devBypass =
    ["1", "true", "yes"].includes(fromEnv("RECAPTCHA_DEV_BYPASS").toLowerCase()) &&
    isLocalLikeHost(host);

  if (devBypass) return { bypass: true };

  // Normal non-prod secret (varsa)
  const devSecret = fromEnv("RECAPTCHA_SECRET_KEY");
  if (devSecret) return { secret: devSecret };

  return { error: "SECRET_MISSING" };
}

export async function verifyRecaptcha(token, { host = "" } = {}) {
  if (!token) return { ok: false, code: "TOKEN_MISSING" };

  const pick = pickSecret(host);
  if (pick.error) return { ok: false, code: pick.error };
  if (pick.bypass) return { ok: true, code: "DEV_BYPASS" };

  const body = new URLSearchParams();
  body.append("secret", pick.secret);
  body.append("response", token);

  for (const url of RECAPTCHA_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);
      if (data?.success === true) return { ok: true, raw: data };

      const code = Array.isArray(data?.["error-codes"])
        ? data["error-codes"][0]
        : "VERIFY_FAILED";

      return { ok: false, code, raw: data || null };
    } catch {
      // diğer endpoint’e dene
    }
  }

  return { ok: false, code: "NETWORK" };
}

export async function verifyRecaptchaFromRequest(req, token) {
  const host =
    req?.headers?.get?.("x-forwarded-host") ||
    req?.headers?.get?.("host") ||
    "";
  const out = await verifyRecaptcha(token, { host });
  return out.ok;
}

export { isLocalLikeHost };
