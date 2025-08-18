"use client";
/**
 * /context/UserContext.js
 * Amaç: Oturum bilgisini tek kez çekip uygulama genelinde paylaşmak.
 *
 * SECURITY NOTES
 * - Kimlik doğrulama NextAuth cookie’leriyle yapılır; custom JWT yok.
 * - /api/me yalnızca minimal alan döner (id/email/role/status); 401/403 → anonim sayılır.
 * - Tüm istekler credentials:"include" ve cache:"no-store" ile yapılır.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";

const UserContext = createContext({
  user: undefined,         // undefined: yüklenmedi, null: anon, object: auth
  ready: false,
  isAuthenticated: false,
  lastError: null,
  refreshUser: async () => {},
  setUser: () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined); // ilk açılış: undefined
  const [lastError, setLastError] = useState(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me", {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        // 401/403/429/5xx → anon kabul et, detay sızdırma
        setUser(null);
        setLastError(null);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.id) {
        setUser(data);
      } else {
        setUser(null);
      }
      setLastError(null);
    } catch {
      setUser(null);
      setLastError("network_error");
    }
  }, []);

  useEffect(() => {
    // İlk yükleme
    fetchMe();
  }, [fetchMe]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      ready: user !== undefined,
      isAuthenticated: !!(user && user.id),
      lastError,
      refreshUser: fetchMe,
    }),
    [user, lastError, fetchMe]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}

export default UserContext;
