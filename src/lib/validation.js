// /lib/validation.js
// Merkezi input doğrulama & sanitize yardımcıları (prod-ready)

import { z } from "zod";
import sanitizeHtmlLib from "sanitize-html";

/**
 * XSS'e karşı tamamen düz metin bırakır (HTML'leri temizler).
 */
export function sanitizeHtml(input) {
  return sanitizeHtmlLib(input ?? "", {
    allowedTags: [],
    allowedAttributes: {},
  });
}

/**
 * TR IBAN doğrulaması (format + MOD97).
 * - TR + 24 rakam, toplam 26 karakter
 * - IBAN checksum: mod97 === 1
 */
export function isIbanTR(ibanRaw) {
  if (!ibanRaw || typeof ibanRaw !== "string") return false;
  const iban = ibanRaw.replace(/\s+/g, "").toUpperCase();
  if (!/^TR\d{24}$/.test(iban)) return false;

  // IBAN mod97
  // 1) İlk 4 karakteri sona al
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  // 2) Harfleri sayıya çevir (A=10 ... Z=35)
  const expanded = rearranged.replace(/[A-Z]/g, ch => (ch.charCodeAt(0) - 55).toString());
  // 3) Büyük sayıyı mod 97 hesapla (parça parça)
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    const part = String(remainder) + expanded.slice(i, i + 7);
    remainder = Number(part) % 97;
  }
  return remainder === 1;
}

/* ---------- Primitive alan şemaları ---------- */
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

/* ---------- Kompozit şemalar (endpoint bazlı) ---------- */

// /api/register
export const registerSchema = z.object({
  name: usernameSchema,
  email: emailSchema,
  password: strongPasswordSchema,
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "Terms must be accepted" }),
  }),
  captcha: z.string().min(10), // reCAPTCHA token uzun oluyor; min 10 yeterli
});

// /api/settings/update (PII alanları)
export const userSettingsSchema = z.object({
  displayName: z.string().min(2).max(64).transform((s) => sanitizeHtml(s)),
  languagePreference: z.enum(["en", "tr"]).optional(),
  currencyCode: z.enum(["TRY", "USD", "EUR"]).optional(),
});

// /api/wallet (bank info)
export const bankInfoSchema = z.object({
  iban: z.string().refine(isIbanTR, "Invalid TR IBAN"),
  bankName: z.string().min(2).max(64).transform((s) => sanitizeHtml(s)),
  realName: z
    .string()
    .min(4)
    .max(100)
    .refine((s) => s.trim().split(/\s+/).length >= 2, "Full legal name required")
    .transform((s) => sanitizeHtml(s)),
});

// /api/payout_request_details, /api/request_payout cancel vs.
export const payoutRequestIdSchema = z.object({
  requestId: z.number().int().positive(),
});

// Basit sayfalama
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* ---------- Yardımcı: güvenli parse ---------- */
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
