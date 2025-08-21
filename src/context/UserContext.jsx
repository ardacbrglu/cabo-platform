"use client";
/**
 * File: src/context/UserContext.jsx
 * Purpose: Oturum bilgisini tek kez çekip uygulama genelinde paylaşmak.
 * Security Docblock:
 * - /api/me minimal alan döner (id/email/role/status/name); 401/403 → anon sayılır.
 * - Tüm istekler tek apiFetch wrapper’ı ile (credentials:include, X-Requested-With, X-Request-Id).
 * UX:
 * - Navbar “jitter” fix: İlk boyadan önce localStorage'dan hydrate edilir.
 * - /api/me döndükten sonra kesin veri ile güncellenir.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { apiFetch } from "@/lib/apiFetch";

const Ctx = createContext({
  user: undefined, // undefined: yüklenmedi, null: anon, object: auth
  ready: false,
  isAuthenticated: false,
  lastError: null,
  refreshUser: async () => {},
  setUser: () => {},
});

const LS_NAME = "cabo_username";
const LS_EMAIL = "cabo_email";
const LS_ID = "cabo_userId";

function readCache() {
  if (typeof window === "undefined") return null;
  const name = localStorage.getItem(LS_NAME) || "";
  const email = localStorage.getItem(LS_EMAIL) || "";
  const idStr = localStorage.getItem(LS_ID);
  const id = idStr ? Number(idStr) : null;
  if (!name && !email && !id) return null;
  return { id, userId: id, name, email, role: "affiliate" };
}

function writeCache(u) {
  if (typeof window === "undefined" || !u) return;
  if (u.name) localStorage.setItem(LS_NAME, u.name);
  else localStorage.removeItem(LS_NAME);
  if (u.email) localStorage.setItem(LS_EMAIL, u.email);
  else localStorage.removeItem(LS_EMAIL);
  if (u.id ?? u.userId) localStorage.setItem(LS_ID, String(u.id ?? u.userId));
  else localStorage.removeItem(LS_ID);
}

function clearCache() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_NAME);
  localStorage.removeItem(LS_EMAIL);
  localStorage.removeItem(LS_ID);
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [lastError, setLastError] = useState(null);
  const [ready, setReady] = useState(false);

  // 1) İlk boya öncesi: cache'den hydrate → navbar jitter fix (tüm sayfalarda)
  useLayoutEffect(() => {
    const cached = readCache();
    if (cached) {
      setUser((u) => ({ ...(u || {}), ...cached }));
    }
  }, []);

  // 2) /api/me ile kesin veri (tüm sayfalarda)
  const fetchMe = useCallback(async () => {
    try {
      const res = await apiFetch("/api/me", { method: "GET" });
      if (!res.ok) {
        setUser(null);
        clearCache();
        setLastError(null);
        setReady(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.id || data?.userId) {
        // normalize
        const normalized = {
          id: data.id ?? data.userId ?? null,
          userId: data.userId ?? data.id ?? null,
          email: data.email || "",
          name: data.name || data.username || "",
          role: data.role || "affiliate",
          status: data.status || "active",
          ...data,
        };
        setUser(normalized);
        writeCache(normalized);
        setLastError(null);
      } else {
        setUser(null);
        clearCache();
        setLastError(null);
      }
    } catch {
      setUser(null);
      setLastError("network_error");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // 3) user değişince cache'i güncelle / temizle
  useEffect(() => {
    if (user && (user.id || user.userId)) writeCache(user);
    if (user === null) clearCache();
  }, [user]);

  // 4) Sekmeler arası senkron (logout/login başka sekmede yapılırsa)
  useEffect(() => {
    function onStorage(e) {
      if (e.key === LS_ID || e.key === LS_NAME || e.key === LS_EMAIL) {
        const cached = readCache();
        if (cached) setUser((u) => ({ ...(u || {}), ...cached }));
        else setUser(null);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser: (u) => {
        setUser(u);
        if (u && (u.id || u.userId)) writeCache(u);
        if (u === null) clearCache();
      },
      ready,
      isAuthenticated: !!(user && (user.id || user.userId)),
      lastError,
      refreshUser: fetchMe,
    }),
    [user, ready, lastError, fetchMe]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() {
  return useContext(Ctx);
}
export default Ctx;
