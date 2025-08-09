// /hooks/useCsrfToken.js
import { useEffect, useRef, useState, useCallback } from "react";

/**
 * SECURITY NOTES
 * - CSRF token hem cookie’ye yazılır hem JSON ile döner.
 * - Bu hook auto-refresh ile token’ı periyodik yeniler.
 * - Sunucu { csrf_token } döner; olası uyum için { csrfToken } fallback de desteklenir.
 */

const CSRF_ENDPOINT = "/api/csrf/csrf-token";
// Token cookie maxAge: 2 saat → güvenli: 90 dk'da bir yenile
const REFRESH_MS = 90 * 60 * 1000;

export function useCsrfToken() {
  const [csrfToken, setCsrfToken] = useState("");
  const [ready, setReady] = useState(false);
  const lastFetchedAt = useRef(0);
  const timerRef = useRef(null);

  const fetchToken = useCallback(async (signal) => {
    const res = await fetch(CSRF_ENDPOINT, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
      },
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CSRF endpoint failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    const token = data?.csrf_token || data?.csrfToken;
    if (!token) throw new Error("CSRF token missing in response");

    setCsrfToken(token);
    lastFetchedAt.current = Date.now();
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    const ac = new AbortController();
    try {
      await fetchToken(ac.signal);
    } finally {
      // no-op
    }
    return () => ac.abort();
  }, [fetchToken]);

  useEffect(() => {
    const ac = new AbortController();
    fetchToken(ac.signal).catch((err) => {
      console.error("CSRF token fetch error:", err);
      // ready=false kalsın
    });

    // 90 dk'da bir otomatik yenile
    timerRef.current = setInterval(() => {
      if (!lastFetchedAt.current || Date.now() - lastFetchedAt.current >= REFRESH_MS) {
        refresh();
      }
    }, 60 * 1000); // her 1 dk kontrol

    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (!lastFetchedAt.current || Date.now() - lastFetchedAt.current >= REFRESH_MS) {
          refresh();
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ac.abort();
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchToken, refresh]);

  return { csrfToken, refresh, ready };
}

export default useCsrfToken;
