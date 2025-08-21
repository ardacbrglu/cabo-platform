"use client";
/**
 * File: src/context/UserContext.jsx
 * Purpose: Oturum bilgisini tek kez çekip uygulama genelinde paylaşmak.
 * Security Docblock:
 * - /api/me minimal alan döner (id/email/role/status/name); 401/403 → anon sayılır.
 * - Tüm istekler tek apiFetch wrapper’ı ile (credentials:include, X-Requested-With, X-Request-Id).
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch } from "@/lib/apiFetch";

const Ctx = createContext({
  user: undefined,  // undefined: yüklenmedi, null: anon, object: auth
  ready: false,
  isAuthenticated: false,
  lastError: null,
  refreshUser: async () => {},
  setUser: () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [lastError, setLastError] = useState(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await apiFetch("/api/me", { method: "GET" });
      if (!res.ok) {
        setUser(null);
        setLastError(null);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.id) setUser(data);
      else setUser(null);
      setLastError(null);
    } catch {
      setUser(null);
      setLastError("network_error");
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const value = useMemo(() => ({
    user,
    setUser,
    ready: user !== undefined,
    isAuthenticated: !!(user && user.id),
    lastError,
    refreshUser: fetchMe,
  }), [user, lastError, fetchMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() { return useContext(Ctx); }
export default Ctx;
