// /hooks/useNotifications.js
/**
 * useNotifications — kullanıcı bildirimleri (polling)
 * SECURITY NOTES:
 * - Mutating isteklerde CSRF header (x-csrf-token) zorunlu.
 * - credentials: "include" ile session cookie taşınır.
 * - Rate limit / auth backend'de ayrıca korunmalıdır.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useCsrfToken } from "@/hooks/useCsrfToken";

const POLL_MS = 12_000;

export function useNotifications() {
  const { csrfToken } = useCsrfToken();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState(null);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  const computeUnread = useCallback((arr) => {
    return Array.isArray(arr) ? arr.filter((n) => !n.read).length : 0;
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setLastError(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "GET",
        credentials: "include",
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
        },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`fetch notifications failed: ${res.status}`);
      const data = await res.json();
      const nots = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(nots);
      setUnreadCount(computeUnread(nots));
    } catch (e) {
      setLastError(e);
      // basit backoff: başarısızsa 5 sn sonra tek seferlik dene
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fetchNotifications().catch(() => {});
      }, 5000);
    } finally {
      setLoading(false);
    }
  }, [computeUnread]);

  useEffect(() => {
    fetchNotifications().catch(() => {});
    // düzenli polling
    const tick = () => fetchNotifications().catch(() => {});
    timerRef.current = setInterval(tick, POLL_MS);

    // sekme tekrar görünür olunca hızlı güncelle
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (abortRef.current) abortRef.current.abort();
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchNotifications]);

  const markSelectedAsRead = useCallback(
    async (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      try {
        const res = await fetch("/api/notifications/mark-read", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            "x-csrf-token": csrfToken || "",
          },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error(`mark-read failed: ${res.status}`);

        setNotifications((prev = []) =>
          Array.isArray(prev)
            ? prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
            : []
        );
        setUnreadCount((prev) => {
          const next = (Array.isArray(notifications) ? notifications : []).map((n) =>
            ids.includes(n.id) ? { ...n, read: true } : n
          );
          return computeUnread(next);
        });
      } catch (e) {
        setLastError(e);
        // geri çek: poll ile zaten güncellenecek
      }
    },
    [csrfToken, notifications, computeUnread]
  );

  const markAllAsRead = useCallback(async () => {
    const unreadIds = (Array.isArray(notifications) ? notifications : [])
      .filter((n) => !n.read)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    await markSelectedAsRead(unreadIds);
  }, [notifications, markSelectedAsRead]);

  const deleteNotifications = useCallback(
    async (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      try {
        const res = await fetch("/api/notifications/delete", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            "x-csrf-token": csrfToken || "",
          },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error(`delete failed: ${res.status}`);

        setNotifications((prev = []) =>
          Array.isArray(prev) ? prev.filter((n) => !ids.includes(n.id)) : []
        );
        setUnreadCount((prev) => {
          const next = (Array.isArray(notifications) ? notifications : []).filter(
            (n) => !ids.includes(n.id)
          );
          return computeUnread(next);
        });
      } catch (e) {
        setLastError(e);
      }
    },
    [csrfToken, notifications, computeUnread]
  );

  return {
    notifications,
    unreadCount,
    loading,
    lastError,
    fetchNotifications,
    markAllAsRead,
    markSelectedAsRead,
    deleteNotifications,
  };
}
