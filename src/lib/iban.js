// /lib/iban.js
// Client & server ortak IBAN yardımcıları (UI için de kullanılıyor)

export function normalizeIban(v) {
  // NFKC normalize + görünmez/bidi/kontrol karakterlerini at + sadece A-Z0-9 bırak
  const raw = String(v ?? "")
    .toUpperCase()
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0000-\u001F\u007F]/g, "")
    .replace(/[^A-Z0-9]/g, "");

  // TR IBAN ise (TR + 24 rakam = 26 uzunluk) fazla karakterleri kes
  if (raw.startsWith("TR") && raw.length > 26) return raw.slice(0, 26);
  return raw;
}

export function isIbanTR(ibanRaw) {
  if (!ibanRaw) return false;
  const iban = normalizeIban(ibanRaw);
  if (!/^TR\d{24}$/.test(iban)) return false;

  // ISO 13616 mod-97-10
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, ch => (ch.charCodeAt(0) - 55).toString());

  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    const d = expanded.charCodeAt(i) - 48; // '0' -> 0
    if (d < 0 || d > 9) return false;
    remainder = (remainder * 10 + d) % 97;
  }
  return remainder === 1;
}
