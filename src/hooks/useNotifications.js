/**
 * File: src/hooks/useNotifications.js
 * Purpose: Bildirimleri periyodik çekmek + işaretleme/silme mutasyonları.
 * Güvenlik: Tüm istekler apiFetch ile (credentials + CSRF otomatik).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";

const POLL_MS = 12_000;

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState(null);

  const abortRef = useRef(null);
  const timerRef = useRef(null);

  const computeUnread = useCallback(
    (arr) => (Array.isArray(arr) ? arr.filter((n) => !n.read).length : 0),
    []
  );

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setLastError(null);

    try {
      const res = await apiFetch("/api/notifications", {
        method: "GET",
        headers: { "cache-control": "no-cache" },
        signal: ac.signal,
      });
      if (res.status === 401 || res.status === 403) {
        setNotifications([]);
        return;
      }
      if (!res.ok) throw new Error(`fetch notifications failed: ${res.status}`);

      const data = await res.json();
      const nots = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(nots);
    } catch (e) {
      if (e?.name !== "AbortError") setLastError(e);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    setUnreadCount(computeUnread(notifications));
  }, [notifications, computeUnread]);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications().catch(() => {});
    timerRef.current = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        fetchNotifications().catch(() => {});
      }
    }, POLL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") fetchNotifications().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (abortRef.current) abortRef.current.abort();
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, fetchNotifications]);

  const markSelectedAsRead = useCallback(
    async (ids) => {
      if (!enabled || !Array.isArray(ids) || ids.length === 0) return;
      try {
        const res = await apiFetch("/api/notifications/mark-read", {
          method: "POST",
          body: { ids },
        });
        if (!res.ok) throw new Error(`mark-read failed: ${res.status}`);
        setNotifications((prev = []) =>
          Array.isArray(prev) ? prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) : []
        );
      } catch {
        /* sessiz; polling toparlar */
      }
    },
    [enabled]
  );

  const _delete = useCallback(
    async (ids) => {
      if (!enabled || !Array.isArray(ids) || ids.length === 0) return;
      try {
        const res = await apiFetch("/api/notifications/delete", {
          method: "POST",
          body: { ids },
        });
        if (!res.ok) throw new Error(`delete failed: ${res.status}`);
        setNotifications((prev = []) =>
          Array.isArray(prev) ? prev.filter((n) => !ids.includes(n.id)) : []
        );
      } catch {
        /* sessiz */
      }
    },
    [enabled]
  );

  // Tekil yardımcılar
  const markOneAsRead = useCallback((id) => markSelectedAsRead([id]), [markSelectedAsRead]);
  const deleteOne = useCallback((id) => _delete([id]), [_delete]);

  return {
    notifications,
    unreadCount,
    loading,
    lastError,
    fetchNotifications,
    markSelectedAsRead,
    markOneAsRead,
    deleteOne,
    // doğru isim (NotificationsPage bununla çağırıyor)
    deleteNotifications: _delete,
    // geri uyumluluk (eski kullanım varsa kırılmasın)
    deletenotifications: _delete,
  };
}
