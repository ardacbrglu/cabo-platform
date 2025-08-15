// context/UserContext.jsx
"use client";

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
  const mountedRef = useRef(true);

  const fetchMe = useCallback(async () => {
    try { acRef.current?.abort(); } catch {}
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

      if (!mountedRef.current) return;

      if (!res.ok) {
        setUser(null);
        setLastError(new Error(`GET /api/me ${res.status}`));
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (data && data.userId) {
        setUser(data);
        setLastError(null);
      } else {
        setUser(null);
        setLastError(null);
      }
    } catch (e) {
      if (!mountedRef.current) return;
      if (e?.name !== "AbortError") {
        setUser(null);
        setLastError(e);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (user === undefined) fetchMe();
    return () => {
      mountedRef.current = false;
      try { acRef.current?.abort(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const refreshUser = useCallback(() => {
    setUser(undefined);
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
