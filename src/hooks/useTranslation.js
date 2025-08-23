"use client";

import { useMemo } from "react";
import { useLocale } from "@/context/LocaleContext";
import messages, { DEFAULT_LOCALE } from "@/locales";

// --- yardımcılar ---
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const k of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k];
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
    // eslint-disable-next-line no-console
    console.warn("[i18n] Missing key:", key);
    warned.add(key);
  }
}

// --- asıl hook ---
export function useI18n(nsPrefix = "") {
  const { locale: ctxLocale } = useLocale?.() || {};
  const loc = (ctxLocale || DEFAULT_LOCALE).toLowerCase().startsWith("tr") ? "tr" : "en";
  const dict = messages[loc] || messages[DEFAULT_LOCALE];
  const fallback = messages[DEFAULT_LOCALE];

  const prefix = nsPrefix ? (nsPrefix.endsWith(".") ? nsPrefix : nsPrefix + ".") : "";

  return useMemo(() => {
    function t(key, vars) {
      const full = prefix + key;
      const v = getByPath(dict, full);
      if (v !== undefined) return typeof v === "string" ? interpolate(v, vars) : v;

      const vf = getByPath(fallback, full);
      if (vf !== undefined) return typeof vf === "string" ? interpolate(vf, vars) : vf;

      warnMissing(full);
      return full; // anahtarı göster
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
      try { return new Intl.NumberFormat(loc, { style: "currency", currency, ...options }).format(amount); }
      catch { return String(amount); }
    }

    return { t, n, d, c, locale: loc };
  }, [dict, fallback, loc, prefix]);
}

// Geriye dönük uyumlu kısayol
export function useTranslation(nsPrefix = "") {
  const api = useI18n(nsPrefix);
  const fn = (key, vars) => api.t(key, vars);
  fn.t = api.t; fn.n = api.n; fn.d = api.d; fn.c = api.c; fn.locale = api.locale;
  return fn;
}

export default useTranslation;
