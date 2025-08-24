"use client";

/**
 * File: src/context/UserContext.jsx
 * Purpose: Oturum bilgisini tek kez sunucudan doğrulayıp uygulama genelinde paylaşmak.
 *
 * Security Docblock (Cabo PROD):
 * - Kimlik durumu yalnızca /api/me yanıtıyla "server-verified" kabul edilir.
 * - localStorage yalnızca UI sarsıntısını azaltır; auth kaynağı değildir.
 * - /api/me 200 + {authenticated:false} → user=null + cache temizliği.
 * - 401/403 çağrılarında login’e otomatik yönlendirme yapılmaz (noAuthRedirect: true).
 */

import React, {
  createContext, useContext, useEffect, useMemo, useState, useCallback,
} from "react";
import { apiFetch } from "@/lib/apiFetch";

const Ctx = createContext({
  user: undefined,          // undefined: yüklenmedi, null: anon, object: server-verified user
  ready: false,             // yalnız /api/me bittiğinde true
  isAuthenticated: false,   // sadece server-verified ise true
  lastError: null,
  refreshUser: async () => {},
  setUser: () => {},
});

const LS_NAME = "cabo_username";
const LS_EMAIL = "cabo_email";
const LS_ID = "cabo_userId";

/* ------ Hafif UI cache ------ */
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
  const [lastError, setLastError] = useState(null);
  const [ready, setReady] = useState(false);
  const [serverAuthenticated, setServerAuthenticated] = useState(false);

  // 1) İlk boya öncesi hafif hydrate (yalnız client)
  useEffect(() => {
    const cached = readCache();
    if (cached) setUser((u) => ({ ...(u || {}), ...cached }));
  }, []);

  // 2) /api/me : tek otorite — manual olarak da çağrılabilsin diye ayrı fonksiyon
  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch("/api/me", { method: "GET", cache: "no-store", noAuthRedirect: true });
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
    }
  }, []);

  // 3) İlk yüklemede çağır ve güvenli cleanup uygula
  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshUser();
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [refreshUser]);

  // 4) user değişince cache senkronu (yalnız server doğrulanmışsa)
  useEffect(() => {
    if (serverAuthenticated && user && (user.id || user.userId)) writeCache(user);
    if (user === null) clearCache();
  }, [serverAuthenticated, user]);

  // 5) Sekmeler arası senkron
  useEffect(() => {
    function onStorage(e) {
      if (e.key === LS_ID || e.key === LS_NAME || e.key === LS_EMAIL) {
        const cached = readCache();
        if (cached) setUser((u) => ({ ...(u || {}), ...cached }));
        else setUser(null);
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
  }, []);

  // setUser fonksiyonunu stable yap
  const setUserSafe = useCallback((u) => {
    setUser(u);
    if (u && (u.id || u.userId)) writeCache(u);
    if (u === null) clearCache();
  }, []);

  const value = useMemo(() => ({
    user,
    setUser: setUserSafe,              // stable
    ready,
    isAuthenticated: serverAuthenticated,
    lastError,
    refreshUser,
  }), [user, ready, serverAuthenticated, lastError, refreshUser, setUserSafe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() { return useContext(Ctx); }
export default Ctx;
