// src/hooks/useTranslation.js
import { useMemo, useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { DEFAULT_LOCALE } from "@/locales";

const dictCache = new Map();

async function loadDict(locale) {
  if (dictCache.has(locale)) return dictCache.get(locale);
  const mod = await import(`@/locales/${locale}/common.json`);
  const dict = mod.default || mod;
  dictCache.set(locale, dict);
  return dict;
}

let enDictPromise = null;
async function ensureEnDict() {
  if (!enDictPromise) enDictPromise = loadDict("en");
  return enDictPromise;
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  let cur = obj;
  for (const seg of String(path).split(".")) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, seg)) cur = cur[seg];
    else return undefined;
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

// ---- Asıl mantık: objeyi üretir
export function useI18n(nsPrefix = "") {
  const { locale: raw } = useLocale();
  const loc = raw || DEFAULT_LOCALE;
  const prefix = nsPrefix ? (nsPrefix.endsWith(".") ? nsPrefix : nsPrefix + ".") : "";

  // sözlükleri 1 kez yüklet, mount sonrasında tetikle
  const [, setTick] = useState(0);
  useEffect(() => {
    let mounted = true;
    loadDict(loc).then(() => mounted && setTick((x) => x + 1)).catch(() => {});
    ensureEnDict().then(() => mounted && setTick((x) => x + 1)).catch(() => {});
    return () => { mounted = false; };
  }, [loc]);

  return useMemo(() => {
    function _t(key, vars) {
      const fullKey = prefix + key;
      const fromLoc = getByPath(dictCache.get(loc), fullKey);
      if (fromLoc !== undefined) return typeof fromLoc === "string" ? interpolate(fromLoc, vars) : fromLoc;
      const fromEn = getByPath(dictCache.get("en"), fullKey);
      if (fromEn !== undefined) return typeof fromEn === "string" ? interpolate(fromEn, vars) : fromEn;
      warnMissing(fullKey);
      return fullKey;
    }
    function _n(number, options) {
      try { return new Intl.NumberFormat(loc, options).format(number); }
      catch { return String(number); }
    }
    function _d(date, options) {
      try {
        const v = date instanceof Date ? date : new Date(date);
        return new Intl.DateTimeFormat(loc, options).format(v);
      } catch { return String(date); }
    }
    function _c(amount, currency = "USD", options) {
      try { return new Intl.NumberFormat(loc, { style: "currency", currency, ...options }).format(amount); }
      catch { return String(amount); }
    }
    return { t: _t, n: _n, d: _d, c: _c, locale: loc };
  }, [loc, prefix]);
}

// ---- Geriye dönük uyum: fonksiyon döndür (aynı zamanda property’leri var)
export function useTranslation(nsPrefix = "") {
  const obj = useI18n(nsPrefix);
  const fn = (key, vars) => obj.t(key, vars);   // doğrudan fonksiyon gibi kullanım
  // ayrıca destructure kullanıma destek
  fn.t = obj.t;
  fn.n = obj.n;
  fn.d = obj.d;
  fn.c = obj.c;
  fn.locale = obj.locale;
  return fn;
}

export default useTranslation;
