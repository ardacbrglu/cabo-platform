// /context/UserContext.jsx
"use client";
/**
 * UserContext — oturum bilgisini tek sefer çekip paylaşır.
 * SECURITY NOTE:
 * - /api/me endpoint'i server'da NextAuth session'ı doğrulamalı.
 * - İsteklerde credentials: "include" kullanıyoruz (cookie taşımak için).
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=anon, object=auth
  const [lastError, setLastError] = useState(null);
  const acRef = useRef(null);

  const fetchMe = useCallback(async () => {
    if (acRef.current) acRef.current.abort();
    const ac = new AbortController();
    acRef.current = ac;

    try {
      const res = await fetch("/api/me", {
        method: "GET",
        credentials: "include",
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        signal: ac.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        setUser(null);
        setLastError(new Error(`GET /api/me ${res.status}`));
        return;
      }
      const data = await res.json().catch(() => ({}));
      // Beklenen minimal şema: { userId, email, role, status, name? }
      if (data && data.userId) {
        setUser(data);
      } else {
        setUser(null);
      }
      setLastError(null);
    } catch (e) {
      if (e.name !== "AbortError") {
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

  // Dışarıya manuel yenile fonksiyonu verelim (login/logout sonrası çağır)
  const refreshUser = useCallback(() => {
    setUser(undefined);
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
