"use client";

/**
 * File: src/context/UserContext.jsx
 * Purpose: Oturum bilgisini tek kez sunucudan doğrulayıp uygulama genelinde paylaşmak.
 *
 * Security Docblock (Cabo PROD):
 * - Kimlik durumu yalnızca /api/me yanıtıyla "server-verified" kabul edilir.
 * - localStorage sadece görsel sarsıntıyı azaltmak için kullanılır; asla auth kaynağı değildir.
 * - /api/me 200 + {authenticated:false} durumunda user=null ve cache temizlenir.
 * - İstemci-yanı etkilerde XSS riskine karşı sadece beklenen primitive alanlar tutulur.
 */

import React, {
  createContext, useContext, useEffect, useMemo, useState,
  useCallback, useLayoutEffect,
} from "react";
import { apiFetch } from "@/lib/apiFetch";

const Ctx = createContext({
  user: undefined,          // undefined: yüklenmedi, null: anon, object: server-verified user
  ready: false,             // yalnızca /api/me tamamlandığında true
  isAuthenticated: false,   // Sadece server-verified auth → true
  lastError: null,
  refreshUser: async () => {},
  setUser: () => {},
});

const LS_NAME = "cabo_username";
const LS_EMAIL = "cabo_email";
const LS_ID = "cabo_userId";

/* Hafif UI cache: sadece navbar titremesini azaltır */
function readCache() {
  if (typeof window === "undefined") return null;
  try {
    const name = localStorage.getItem(LS_NAME) || "";
    const email = localStorage.getItem(LS_EMAIL) || "";
    const idStr = localStorage.getItem(LS_ID);
    const id = idStr ? Number(idStr) : null;
    if (!name && !email && !id) return null;
    return { id, userId: id, name, email, role: "affiliate", _source: "cache" };
  } catch {
    return null;
  }
}
function writeCache(u) {
  if (typeof window === "undefined" || !u) return;
  try {
    if (u.name) localStorage.setItem(LS_NAME, u.name); else localStorage.removeItem(LS_NAME);
    if (u.email) localStorage.setItem(LS_EMAIL, u.email); else localStorage.removeItem(LS_EMAIL);
    const uid = u.id ?? u.userId;
    if (uid) localStorage.setItem(LS_ID, String(uid)); else localStorage.removeItem(LS_ID);
  } catch {}
}
function clearCache() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_NAME);
    localStorage.removeItem(LS_EMAIL);
    localStorage.removeItem(LS_ID);
  } catch {}
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [ready, setReady] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [serverAuthenticated, setServerAuthenticated] = useState(false);

  // 1) İlk boya öncesi: sadece görsel stabilite için cache'i geçir (auth sayılmaz)
  useLayoutEffect(() => {
    const cached = readCache();
    if (cached) setUser((u) => ({ ...(u || {}), ...cached }));
  }, []);

  // 2) /api/me → auth kaynağı sadece burasıdır
  const fetchMe = useCallback(async () => {
    try {
      const res = await apiFetch("/api/me", { method: "GET", cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        setServerAuthenticated(false);
        clearCache();
        setLastError(null);
        return;
      }
      const data = await res.json().catch(() => ({}));

      if (data && (data.id || data.userId)) {
        const normalized = {
          id: data.id ?? data.userId ?? null,
          userId: data.userId ?? data.id ?? null,
          email: data.email || "",
          name: data.name || data.username || "",
          role: data.role || "affiliate",
          status: data.status || "active",
        };
        setUser(normalized);
        setServerAuthenticated(true);
        writeCache(normalized);
        setLastError(null);
      } else {
        setUser(null);
        setServerAuthenticated(false);
        clearCache();
        setLastError(null);
      }
    } catch {
      setUser(null);
      setServerAuthenticated(false);
      setLastError("network_error");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // 3) user değişince cache senkronu (yalnız server doğrulanmışsa kalıcılaştır)
  useEffect(() => {
    if (serverAuthenticated && user && (user.id || user.userId)) writeCache(user);
    if (user === null) clearCache();
  }, [serverAuthenticated, user]);

  // 4) Sekmeler arası basit senkron
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

  const value = useMemo(() => ({
    user,
    setUser: (u) => {
      setUser(u);
      // dışarıdan setUser çağrılarında auth state’i değiştirmeyiz
      if (u && (u.id || u.userId)) writeCache(u);
      if (u === null) clearCache();
    },
    ready,
    isAuthenticated: serverAuthenticated, // 🔒 sadece server-verified
    lastError,
    refreshUser: fetchMe,
  }), [user, ready, serverAuthenticated, lastError, fetchMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() { return useContext(Ctx); }
export default Ctx;
