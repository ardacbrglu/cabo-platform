/**
 * File: src/hooks/useNotifications.js
 * Purpose: Bildirimleri periyodik çekmek ve işaretleme/silme mutasyonlarını yapmak.
 * Security Docblock:
 * - GET/POST istekleri tek apiFetch ile gider (credentials, X-Requested-With, X-Request-Id).
 * - CSRF zorunlu değil; ancak uyumluluk için /api/auth/csrf bir kez alınır ve header'a opsiyonel eklenir.
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
  const csrfRef = useRef("");

  // Opsiyonel CSRF token: bir kez al
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (j?.csrfToken) csrfRef.current = j.csrfToken;
      } catch {}
    })();
  }, []);

  const computeUnread = useCallback((arr) => {
    return Array.isArray(arr) ? arr.filter((n) => !n.read).length : 0;
  }, []);

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
        setNotifications([]); setUnreadCount(0);
        return;
      }
      if (!res.ok) throw new Error(`fetch notifications failed: ${res.status}`);

      const data = await res.json();
      const nots = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(nots);
      setUnreadCount(computeUnread(nots));
    } catch (e) {
      if (e?.name === "AbortError") return;
      setLastError(e);
    } finally {
      setLoading(false);
    }
  }, [enabled, computeUnread]);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications().catch(() => {});
    timerRef.current = setInterval(() => fetchNotifications().catch(() => {}), POLL_MS);

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

  const markSelectedAsRead = useCallback(async (ids) => {
    if (!enabled || !Array.isArray(ids) || ids.length === 0) return;
    try {
      const res = await apiFetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { ...(csrfRef.current ? { "X-CSRF-Token": csrfRef.current } : {}) },
        body: { ids },
      });
      if (!res.ok) throw new Error(`mark-read failed: ${res.status}`);

      setNotifications((prev = []) =>
        Array.isArray(prev) ? prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) : []
      );
      setUnreadCount((_) => {
        const next = (Array.isArray(notifications) ? notifications : []).map((n) =>
          ids.includes(n.id) ? { ...n, read: true } : n
        );
        return computeUnread(next);
      });
    } catch {
      // sessiz; bir sonraki poll düzeltir
    }
  }, [enabled, notifications, computeUnread]);

  const markAllAsRead = useCallback(() => {
    const unreadIds = (Array.isArray(notifications) ? notifications : [])
      .filter((n) => !n.read)
      .map((n) => n.id);
    return markSelectedAsRead(unreadIds);
  }, [notifications, markSelectedAsRead]);

  const deleteNotifications = useCallback(async (ids) => {
    if (!enabled || !Array.isArray(ids) || ids.length === 0) return;
    try {
      const res = await apiFetch("/api/notifications/delete", {
        method: "POST",
        headers: { ...(csrfRef.current ? { "X-CSRF-Token": csrfRef.current } : {}) },
        body: { ids },
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);

      setNotifications((prev = []) =>
        Array.isArray(prev) ? prev.filter((n) => !ids.includes(n.id)) : []
      );
      setUnreadCount((_) => {
        const next = (Array.isArray(notifications) ? notifications : []).filter(
          (n) => !ids.includes(n.id)
        );
        return computeUnread(next);
      });
    } catch {
      // sessiz
    }
  }, [enabled, notifications, computeUnread]);

  return { notifications, unreadCount, loading, lastError, fetchNotifications, markAllAsRead, markSelectedAsRead, deleteNotifications };
}
