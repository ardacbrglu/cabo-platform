// /src/hooks/useCsrfToken.js
import { useEffect, useRef, useState, useCallback } from "react";

/**
 * CSRF token hem cookie’ye yazılır hem JSON ile döner.
 * Endpoint: /api/csrf/csrf-token
 */

const CSRF_ENDPOINT = "/api/csrf/csrf-token";
const REFRESH_MS = 90 * 60 * 1000; // 90 dk

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
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CSRF endpoint failed: ${res.status} ${text}`);
    }
    const data = await res.json().catch(() => ({}));
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
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("CSRF token fetch error:", err);
      }
    }
    return () => ac.abort();
  }, [fetchToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ac = new AbortController();
    fetchToken(ac.signal).catch((err) => {
      // Yalnızca AbortError dışındakileri logla
      if (err?.name !== "AbortError") {
        console.error("CSRF token fetch error:", err);
      }
    });

    // Arkaplanda periyodik yenileme
    timerRef.current = setInterval(() => {
      if (!lastFetchedAt.current || Date.now() - lastFetchedAt.current >= REFRESH_MS) {
        refresh();
      }
    }, 60 * 1000);

    // Sekme yeniden görünür olduğunda gerekiyorsa yenile
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
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchToken, refresh]);

  return { csrfToken, refresh, ready };
}

export default useCsrfToken;
