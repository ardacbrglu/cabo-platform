"use client";
/**
 * /context/UserContext.jsx
 * Amaç: Oturum bilgisini (NextAuth session üzerinden) tek kez çekip uygulama genelinde paylaşmak.
 *
 * SECURITY NOTES
 * - Kimlik doğrulama NextAuth cookie'leri ile yapılır; custom JWT yok.
 * - /api/me yalnızca güvenli alanları döner ve 401/403 durumlarında anon sayılırız.
 * - İstekler credentials: "include" ile yapılır ve cache devre dışı bırakılır.
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

const UserContext = createContext({
  user: undefined,            // undefined=loading, null=anon, object=auth
  setUser: () => {},
  lastError: null,
  refreshUser: async () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [lastError, setLastError] = useState(null);
  const acRef = useRef(null);

  const fetchMe = useCallback(async () => {
    // Var olan isteği iptal et
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
        // 401/403/404 → anon kabul et
        setUser(null);
        setLastError(new Error(`GET /api/me ${res.status}`));
        return;
        }
      const data = await res.json().catch(() => ({}));

      // Beklenen minimal şema: { userId, email, role, status, name? }
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

  // İlk yükleme
  useEffect(() => {
    if (user === undefined) {
      fetchMe();
    }
    return () => {
      acRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Login/logout sonrası manuel yenilemek için
  const refreshUser = useCallback(() => {
    setUser(undefined); // loading state
    return fetchMe();
  }, [fetchMe]);

  const value = useMemo(
    () => ({ user, setUser, lastError, refreshUser }),
    [user, lastError, refreshUser]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}

export default UserContext;
