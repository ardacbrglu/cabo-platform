// /lib/validation.js
// Merkezi input doğrulama & sanitize yardımcıları (prod-ready)
// Bu dosya yalnızca server tarafında kullanılmalıdır.
import "server-only";
import { z } from "zod";
import sanitizeHtmlLib from "sanitize-html";

/**
 * HTML temizleyip düz metin bırakır (XSS'e karşı güvenli).
 * - Tüm tag ve attribute'lar atılır, metin korunur.
 */
export function sanitizeHtml(input) {
  return sanitizeHtmlLib(String(input ?? ""), {
    allowedTags: [],
    allowedAttributes: {},
    // disallowedTagsMode: 'discard' default
  });
}

/**
 * TR IBAN doğrulaması (format + MOD97)
 * - TR + 24 rakam (toplam 26)
 * - IBAN checksum: mod97 === 1
 * - Büyük sayıya parse etmeden dijit-dijit mod alır (overflow yok)
 */
export function isIbanTR(ibanRaw) {
  if (!ibanRaw || typeof ibanRaw !== "string") return false;
  const iban = ibanRaw.replace(/\s+/g, "").toUpperCase();
  if (!/^TR\d{24}$/.test(iban)) return false;

  // 1) İlk 4 karakteri sona al
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  // 2) Harfleri sayıya çevir (A=10 ... Z=35). TR IBAN'da ek harf yok ama genel IBAN akışı:
  const expanded = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());

  // 3) Dijit-dijit mod 97
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    const d = expanded.charCodeAt(i) - 48; // '0' -> 0
    if (d < 0 || d > 9) return false; // güvence
    remainder = (remainder * 10 + d) % 97;
  }
  return remainder === 1;
}

/* ───────── Primitive alan şemaları ───────── */

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/);

export const emailSchema = z.string().email();

export const strongPasswordSchema = z
  .string()
  .min(8)
  .refine((v) => /[a-z]/.test(v), "At least one lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "At least one uppercase letter")
  .refine((v) => /\d/.test(v), "At least one number");

/* ───────── Kompozit şemalar (endpoint bazlı) ───────── */

/**
 * /api/register
 * Not: Captcha doğruluğu backend’de dış serviste (Google/Turnstile) yine kontrol edilmelidir.
 */
export const registerSchema = z.object({
  name: usernameSchema,
  email: emailSchema,
  password: strongPasswordSchema,
  captcha: z.string().min(10), // token uzunluğu için makul alt sınır
});

/**
 * /api/settings/update
 * Diller/para birimleri DB'den dinamik geldiği için burada biçim kontrolü yapıyoruz,
 * "desteklenen değer mi" kontrolünü route tarafında (DB/Config'e göre) yapın.
 */
export const userSettingsSchema = z.object({
  displayName: z
    .string()
    .max(80)
    .transform((s) => sanitizeHtml(s).trim())
    .refine((s) => s.length >= 2, "Name too short"),
  languagePreference: z.string().min(2).max(5).optional(), // örn: "tr", "en", "en-US"
  currencyCode: z.string().length(3).optional(), // ISO3: TRY, USD, EUR...
});

/**
 * /api/wallet bank info
 * Backend’deki limitlerle hizalı (max 120).
 */
export const bankInfoSchema = z.object({
  iban: z.string().refine(isIbanTR, "Invalid TR IBAN"),
  bankName: z
    .string()
    .min(2)
    .max(120)
    .transform((s) => sanitizeHtml(s).trim())
    .refine((s) => s.length >= 2, "Bank name required"),
  realName: z
    .string()
    .min(4)
    .max(120)
    .transform((s) => sanitizeHtml(s).trim().replace(/\s+/g, " "))
    .refine((s) => s.split(/\s+/).length >= 2, "Full legal name required"),
});

/**
 * /api/payout_request_details, cancel vs.
 */
export const payoutRequestIdSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

/**
 * Basit sayfalama (page, limit)
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* ───────── Yardımcı: güvenli parse ───────── */

/**
 * Zod safeParse sarmalayıcısı: ilk hatayı HTTP 400 fırlatır.
 * try/catch içinde kullanın; err.status mevcut olur.
 */
export function safeParse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues?.[0]?.message || "Validation error";
    const path = r.error.issues?.[0]?.path?.join(".") || "";
    const err = new Error(path ? `${msg} (${path})` : msg);
    err.status = 400;
    throw err;
  }
  return r.data;
}
