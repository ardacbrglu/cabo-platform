"use client";
/**
 * /context/UserContext.jsx
 * Amaç: Oturum bilgisini (NextAuth session cookie’leri) /api/me üzerinden tek kez çekip
 * uygulama genelinde paylaşmak.
 *
 * SECURITY NOTES
 * - Oturum tek kaynağı NextAuth’tır; custom JWT/cookie yok.
 * - /api/me yalnız güvenli alanları döner; 401/403/404 durumunda anon kabul edilir.
 * - İstek cache’lenmez (no-store) ve credentials: "include" gönderilir.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";

const noop = () => {};
const UserContext = createContext({
  user: undefined,          // undefined = loading, null = anon, object = auth payload
  ready: false,             // user !== undefined
  isAuthenticated: false,   // !!user && !!user.userId
  setUser: noop,
  lastError: null,
  refreshUser: async () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [lastError, setLastError] = useState(null);
  const acRef = useRef(null);

  const fetchMe = useCallback(async () => {
    // Önceki isteği iptal et
    if (acRef.current) acRef.current.abort();
    const ac = new AbortController();
    acRef.current = ac;

    try {
      const res = await fetch("/api/me", {
        method: "GET",
        credentials: "include", // NextAuth session cookie'leri
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        signal: ac.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        // 401/403/404/429 → anon kabul et (enumeration yok)
        setUser(null);
        setLastError(new Error(`GET /api/me ${res.status}`));
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Beklenen minimal şema: { userId, email, role, status, name?, languagePreference?, currencyCode? }
      if (data && data.userId) {
        setUser(data);
        setLastError(null);
      } else {
        setUser(null);
        setLastError(null);
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        setUser(null);
        setLastError(e);
      }
    }
  }, []);

  // İlk yükleme (ve refreshUser -> user = undefined olduğunda)
  useEffect(() => {
    if (user === undefined) {
      fetchMe();
    }
    return () => {
      acRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Login/logout sonrası yeniden okumak için
  const refreshUser = useCallback(() => {
    setUser(undefined); // loading state tetikler
    return fetchMe();
  }, [fetchMe]);

  const ready = user !== undefined;
  const isAuthenticated = !!(user && user.userId);

  const value = useMemo(
    () => ({ user, ready, isAuthenticated, setUser, lastError, refreshUser }),
    [user, ready, isAuthenticated, lastError, refreshUser]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}

export default UserContext;
