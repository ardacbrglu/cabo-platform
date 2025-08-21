/**
 * File: src/lib/captcha.js
 * Purpose: reCAPTCHA doğrulaması için merkezî yardımcı.
 * Security Docblock:
 * - Sunucu tarafı doğrulama zorunlu; client token tek başına yeterli değildir.
 * - Google reCAPTCHA v2/v3 siteverify kullanılır.
 */

export async function verifyRecaptcha(responseToken) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret || !responseToken) return { ok: false };

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: responseToken }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: !!data?.success, raw: data };
  } catch {
    return { ok: false };
  }
}
