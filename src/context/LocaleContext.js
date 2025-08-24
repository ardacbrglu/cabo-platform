"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

const DEFAULT_LOCALE = "en";

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name, value) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365; // 1 yıl
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

const Ctx = createContext({
  locale: DEFAULT_LOCALE,
  ready: false,
  setLocale: () => {},
  persistLocale: async () => {},
});

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  // İlk değer: cookie → en/tr normalizasyonu
  useEffect(() => {
    try {
      const c = (readCookie("locale") || DEFAULT_LOCALE).toLowerCase();
      setLocale(c.startsWith("tr") ? "tr" : "en");
    } catch {}
  }, []);

  // Giriş yapılmışsa DB tercihinden override et
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await apiFetch("/api/me", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (aborted) return;
        setLoggedIn(true);
        const dbLang = String(data?.languagePreference || data?.language || "")
          .toLowerCase();
        if (dbLang === "en" || dbLang === "tr") {
          setLocale(dbLang);
          writeCookie("locale", dbLang);
        }
      } catch {
        // sessiz
      } finally {
        if (!aborted) setReady(true);
      }
    })();
    return () => { aborted = true; };
  }, []);

  // UI’dan değiştirildiğinde: state + cookie + (login’se) DB
  const persistLocale = async (lng) => {
    const norm = String(lng || "").toLowerCase();
    const v = norm.startsWith("tr") ? "tr" : "en";
    setLocale(v);
    writeCookie("locale", v);
    if (loggedIn) {
      try {
        await apiFetch("/api/settings/update", {
          method: "PATCH",
          body: { languagePreference: v },
        });
      } catch {
        // DB yazılamasa da UI dili kalır; bir sonraki girişte tekrar dener.
      }
    }
  };

  const value = useMemo(
    () => ({ locale, ready, setLocale, persistLocale }),
    [locale, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale() {
  return useContext(Ctx);
}
