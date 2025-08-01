'use client';
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const LocaleContext = createContext();

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = "en";
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("locale");
      if (saved) initial = saved;
      else {
        const browserLang = navigator.language.split('-')[0];
        if (["en", "tr"].includes(browserLang)) initial = browserLang;
      }
    }
    setLocale(initial);
    setReady(true);
  }, []);

  // Değişen locale'ı storage'a yaz, context value'yu değiştir
  const handleSetLocale = (lng) => {
    setLocale(lng);
    if (typeof window !== "undefined") {
      localStorage.setItem("locale", lng);
    }
  };

  const contextValue = useMemo(() => ({
    locale,
    setLocale: handleSetLocale,
    ready
  }), [locale, ready]);

  return (
    <LocaleContext.Provider value={contextValue}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
