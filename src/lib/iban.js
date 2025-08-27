// /lib/iban.js
export function normalizeIban(v) {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[\u00A0\u1680\u180E\u2000-\u200F\u202F\u205F\u2060\u2066-\u2069\u3000\uFEFF]/g, " ")
    .replace(/[^A-Z0-9]/g, "");
}

export function isIbanTR(ibanRaw) {
  if (!ibanRaw) return false;
  const iban = normalizeIban(ibanRaw);
  if (!/^TR\d{24}$/.test(iban)) return false;

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
