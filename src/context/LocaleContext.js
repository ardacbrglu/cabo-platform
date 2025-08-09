"use client";
/**
 * LocaleContext — dil tercih yönetimi (persist + <html lang>)
 * - Browser diline auto-fallback
 * - Sadece SUPPORTED_LOCALES whitelist
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/locales";

const LocaleContext = createContext({ locale: DEFAULT_LOCALE, setLocale: () => {}, ready: false });

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = DEFAULT_LOCALE;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("locale");
      if (saved && SUPPORTED_LOCALES.includes(saved)) {
        initial = saved;
      } else {
        const browserLang = (navigator.language || "").split("-")[0];
        if (SUPPORTED_LOCALES.includes(browserLang)) initial = browserLang;
      }
    }
    setLocale(initial);
    setReady(true);
  }, []);

  // <html lang="..">
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", locale || DEFAULT_LOCALE);
    }
  }, [locale]);

  function handleSetLocale(next) {
    const clean = SUPPORTED_LOCALES.includes(next) ? next : DEFAULT_LOCALE;
    setLocale(clean);
    if (typeof window !== "undefined") {
      localStorage.setItem("locale", clean);
    }
  }

  const value = useMemo(() => ({ locale, setLocale: handleSetLocale, ready }), [locale, ready]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
