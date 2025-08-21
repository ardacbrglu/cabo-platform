"use client";
/**
 * LocaleContext — dil tercih yönetimi (persist + <html lang>)
 * - Browser diline auto-fallback
 * - Cookie + localStorage senkron (SSR root layout ile uyum)
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/locales";

const LocaleContext = createContext({ locale: DEFAULT_LOCALE, setLocale: () => {}, ready: false });

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name, value, { days = 365 } = {}) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = DEFAULT_LOCALE;
    if (typeof window !== "undefined") {
      const cookieVal = readCookie("locale");
      const saved = localStorage.getItem("locale");
      // Öncelik: cookie (SSR ile uyum) -> localStorage -> browser
      if (cookieVal && SUPPORTED_LOCALES.includes(cookieVal)) {
        initial = cookieVal;
      } else if (saved && SUPPORTED_LOCALES.includes(saved)) {
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
      writeCookie("locale", clean);
    }
  }

  const value = useMemo(() => ({ locale, setLocale: handleSetLocale, ready }), [locale, ready]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
