// Server-only input validation & sanitization helpers (prod-ready)
import "server-only";
import { z } from "zod";
import sanitizeHtmlLib from "sanitize-html";

/* ───────── Sanitize helpers ───────── */

/** HTML'i temizler, görünmez/BiDi kontrol karakterlerini atar, NFKC normalize eder. */
export function sanitizeText(input) {
  const raw = String(input ?? "");
  const stripped = sanitizeHtmlLib(raw, { allowedTags: [], allowedAttributes: {} });

  // Zero-width, BiDi, BOM & kontrol karakterleri (DEL dahil)
  const INVISIBLE_AND_BIDI =
    /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0000-\u001F\u007F]/g;

  const noInvisible = stripped.replace(INVISIBLE_AND_BIDI, "");
  return noInvisible.normalize("NFKC").trim();
}

// okunurluk için alias
export const sanitizeHtml = sanitizeText;

/** TR IBAN için: tüm unicode boşluk/sepatörleri normal boşluğa çevir, sonra alfasayısal dışını at, uppercase. */
export function normalizeIban(v) {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[\u00A0\u1680\u180E\u2000-\u200F\u202F\u205F\u2060\u2066-\u2069\u3000\uFEFF]/g, " ")
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeRealName(v) {
  return sanitizeText(v).replace(/\s+/g, " ");
}

export function normalizeBankName(v) {
  return sanitizeText(v);
}

/** ISO 13616 mod-97-10 ile sıkı TR IBAN doğrulaması. */
export function isIbanTR(ibanRaw) {
  if (!ibanRaw || typeof ibanRaw !== "string") return false;
  const iban = normalizeIban(ibanRaw);
  if (!/^TR\d{24}$/.test(iban)) return false;

  // İlk 4 karakteri sona taşı, A=10..Z=35'e çevir, mod 97 akış hesapla
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());

  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    const d = expanded.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    remainder = (remainder * 10 + d) % 97;
  }
  return remainder === 1;
}

/* ───────── Primitive / reusable field schemas ───────── */

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/);

export const emailSchema = z.string().email();

export const strongPasswordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .refine((v) => /[a-z]/.test(v), "At least one lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "At least one uppercase letter")
  .refine((v) => /\d/.test(v), "At least one number");

export const ibanSchema = z
  .preprocess((v) => normalizeIban(v), z.string())
  .refine(isIbanTR, "Invalid TR IBAN");

export const bankNameSchema = z
  .string()
  .max(120)
  .transform((s) => normalizeBankName(s))
  .refine((s) => s.length >= 2, "Bank name required");

export const realNameSchema = z
  .string()
  .max(120)
  .transform((s) => normalizeRealName(s))
  .refine((s) => s.split(/\s+/).length >= 2, "Full legal name required");

/* ───────── Composite schemas (endpoint level) ───────── */

export const bankInfoSchema = z.object({
  iban: ibanSchema,
  bankName: bankNameSchema,
  realName: realNameSchema,
});

export const payoutRequestIdSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

export const updateRequestBankSchema = payoutRequestIdSchema.extend({
  updateRequestBank: z.literal(true),
  iban: ibanSchema,
  bankName: bankNameSchema,
  realName: realNameSchema,
});

/* (opsiyonel) güvenli parse helper'ı */
export function safeParse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues?.[0];
    const msg = issue?.message || "Validation error";
    const path = issue?.path?.join(".") || "";
    const err = new Error(path ? `${msg} (${path})` : msg);
    err.status = 400;
    throw err;
  }
  return r.data;
}
