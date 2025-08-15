// /hooks/useCsrfToken.js
import { useEffect, useRef, useState, useCallback } from "react";

/**
 * SECURITY NOTES
 * - CSRF token hem cookie’ye yazılır hem JSON ile döner.
 * - Bu hook token'ı alır, 90 dakikada bir yeniler.
 * - Sunucu { csrf_token } döner; uyumluluk için { csrfToken } da desteklenir.
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

    const data = await res.json().catch(() => ({}));
    const token = data?.csrf_token || data?.csrfToken;
    if (!token) throw new Error("CSRF token missing in response");

    setCsrfToken(token);
    lastFetchedAt.current = Date.now();
    setReady(true);
    return token;
  }, []);

  const refresh = useCallback(async () => {
    const ac = new AbortController();
    try {
      await fetchToken(ac.signal);
    } catch (err) {
      // sayfa/dependency değişiminde istek iptal edilebilir, loglama.
      if (err?.name === "AbortError") return;
      console.error("CSRF token refresh error:", err);
    }
    return () => ac.abort();
  }, [fetchToken]);

  useEffect(() => {
    const ac = new AbortController();

    // ilk alım
    fetchToken(ac.signal).catch((err) => {
      if (err?.name === "AbortError") return; // 🔇
      console.error("CSRF token fetch error:", err);
      // ready=false kalsın; token gerektiren POST’lar disabled kalır
    });

    // 90 dk eşiğini kontrol eden dakikalık timer
    timerRef.current = setInterval(() => {
      if (
        !lastFetchedAt.current ||
        Date.now() - lastFetchedAt.current >= REFRESH_MS
      ) {
        refresh();
      }
    }, 60 * 1000);

    // sekme görünür olunca eşiği geçtiyse yenile
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (
          !lastFetchedAt.current ||
          Date.now() - lastFetchedAt.current >= REFRESH_MS
        ) {
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
