"use client";

/**
 * File: src/hooks/useCsrfToken.js
 * Purpose: NextAuth CSRF token'ını client tarafında tek noktadan almak (compat shim).
 *
 * Notlar:
 * - /api/auth/csrf endpoint'ini çağırır, token varsa döndürür ve cookie'leri bootstrap eder.
 * - Tek sefer cache'ler; refresh() ile manuel yenilenebilir.
 * - Hem default hem named export veriyoruz: import useCsrfToken from "@/hooks/useCsrfToken"
 *   veya import { useCsrfToken } from "@/hooks/useCsrfToken" ikisi de çalışır.
 */

import { useEffect, useRef, useState } from "react";

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 dakika
let _cache = { token: "", fetched: false, ts: 0 };

async function _fetchToken() {
  try {
    const r = await fetch("/api/auth/csrf", { credentials: "include" });
    const j = await r.json().catch(() => ({}));
    const token = j?.csrfToken || "";
    _cache = { token, fetched: true, ts: Date.now() };
    return token;
  } catch {
    _cache = { token: "", fetched: true, ts: Date.now() };
    return "";
  }
}

export function useCsrfToken(options = {}) {
  const ttlMs = typeof options.ttlMs === "number" ? options.ttlMs : DEFAULT_TTL_MS;

  const [token, setToken] = useState(_cache.token);
  const [ready, setReady] = useState(_cache.fetched);
  const [error, setError] = useState(null);
  const fetching = useRef(false);

  useEffect(() => {
    const fresh = _cache.fetched && Date.now() - _cache.ts < ttlMs;
    if (fresh || fetching.current) {
      // cache'ten doldur
      setToken(_cache.token);
      setReady(_cache.fetched);
      return;
    }
    fetching.current = true;
    _fetchToken()
      .then((t) => setToken(t))
      .catch((e) => setError(e))
      .finally(() => {
        fetching.current = false;
        setReady(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    try {
      const t = await _fetchToken();
      setToken(t);
      setReady(true);
      setError(null);
      return t;
    } catch (e) {
      setError(e);
      throw e;
    }
  };

  return { token, csrfToken: token, ready, error, refresh };
}

export default useCsrfToken;
