// /hooks/useTranslation.js
/**
 * useTranslation — minimal i18n (prod-ready, lazy loaded)
 * - Dot-notation key: t("homepage.title")
 * - Fallback: selected -> en -> key
 * - Interpolation: t("msg", { name: "Ali" })
 * - Intl helpers: n(), d(), c()
 * - Lazy load JSON by locale, cache in-memory
 */
import { useMemo } from "react";
import { useLocale } from "@/context/LocaleContext";
import { DEFAULT_LOCALE } from "@/locales";

const dictCache = new Map(); // locale -> dict object

async function loadDict(locale) {
  if (dictCache.has(locale)) return dictCache.get(locale);
  // Namespace “common” zorunlu değil; tüm stringler bu tek JSON’da da olabilir.
  // İstersen dosyaları bölebilirsin: common.json, dashboard.json...
  const mod = await import(`@/locales/${locale}/common.json`);
  const dict = mod.default || mod;
  dictCache.set(locale, dict);
  return dict;
}

// Simple sync wrapper: ilk render’da en-US yoksa “en” dict ile idare eder.
// SSR/CSR’de ilk anda missing olabilir; ikinci render’da cache dolu olur.
let enDictPromise = null;
async function ensureEnDict() {
  if (!enDictPromise) enDictPromise = loadDict("en");
  return enDictPromise;
}

/* ---------- helpers ---------- */
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  let cur = obj;
  for (const seg of String(path).split(".")) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, seg)) {
      cur = cur[seg];
    } else return undefined;
  }
  return cur;
}

function interpolate(str, vars) {
  if (!vars || typeof str !== "string") return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`
  );
}

const warned = new Set();
function warnMissing(key) {
  if (process.env.NODE_ENV !== "production" && !warned.has(key)) {
    console.warn(`[i18n] Missing key: ${key}`);
    warned.add(key);
  }
}

/* ---------- hook ---------- */
export function useTranslation(nsPrefix = "") {
  const { locale: raw } = useLocale();
  const loc = raw || DEFAULT_LOCALE;

  // prefix “homepage.” gibi
  const prefix = nsPrefix ? (nsPrefix.endsWith(".") ? nsPrefix : nsPrefix + ".") : "";

  return useMemo(() => {
    // dict getter: async yüklemeyi şimdilik gizleriz; cache yoksa en’e düşer.
    // CSR’de kısa sürede dict yüklenip sonraki render’da hazır olur.
    let dict = dictCache.get(loc);
    let enDict = dictCache.get("en");

    // Lazy kick-off (fire and forget)
    loadDict(loc).catch(() => {});
    ensureEnDict().catch(() => {});

    function t(key, vars) {
      const fullKey = prefix + key;
      const fromLoc = getByPath(dictCache.get(loc), fullKey);
      if (fromLoc !== undefined) {
        return typeof fromLoc === "string" ? interpolate(fromLoc, vars) : fromLoc;
      }
      const fromEn = getByPath(dictCache.get("en"), fullKey);
      if (fromEn !== undefined) {
        return typeof fromEn === "string" ? interpolate(fromEn, vars) : fromEn;
      }
      warnMissing(fullKey);
      return fullKey; // debug amaçlı
    }

    function n(number, options) {
      try { return new Intl.NumberFormat(loc, options).format(number); }
      catch { return String(number); }
    }
    function d(date, options) {
      try {
        const v = date instanceof Date ? date : new Date(date);
        return new Intl.DateTimeFormat(loc, options).format(v);
      } catch { return String(date); }
    }
    function c(amount, currency = "USD", options) {
      try {
        return new Intl.NumberFormat(loc, { style: "currency", currency, ...options }).format(amount);
      } catch { return String(amount); }
    }

    return { t, locale: loc, n, d, c };
  }, [loc, prefix]);
}

export default useTranslation;
