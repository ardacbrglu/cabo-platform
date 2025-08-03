import { useEffect, useState, useCallback } from "react";

// Bildirim hook'u
export function useNotifications() {
  const [notifications, setnotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Bildirimleri getir
  const fetchnotifications = useCallback(async () => {
    const res = await fetch('/api/notifications');
    const data = await res.json();
    const nots = Array.isArray(data.notifications) ? data.notifications : [];
    setnotifications(nots);
    setUnreadCount(nots.filter(n => !n.read).length);
  }, []);

  useEffect(() => {
    fetchnotifications();
    const interval = setInterval(fetchnotifications, 12000);
    return () => clearInterval(interval);
  }, [fetchnotifications]);

  // Seçili bildirimi okundu yap
  const markSelectedAsRead = async (ids) => {
    if (!ids.length) return;
    await fetch('/api/notifications/mark-read', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setnotifications((nots = []) => Array.isArray(nots)
      ? nots.map(n => ids.includes(n.id) ? { ...n, read: true } : n)
      : []
    );
    setUnreadCount((nots = []) => Array.isArray(nots)
      ? nots.map(n => ids.includes(n.id) ? { ...n, read: true } : n).filter(n => !n.read).length
      : 0
    );
  };

  // Tüm bildirimi okundu yap
  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    await markSelectedAsRead(unreadIds);
  };

  // Bildirim(ler)i sil
  const deletenotifications = async (ids) => {
    if (!ids.length) return;
    await fetch('/api/notifications/delete', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setnotifications((nots = []) => Array.isArray(nots)
      ? nots.filter(n => !ids.includes(n.id))
      : []
    );
    setUnreadCount((nots = []) => Array.isArray(nots)
      ? nots.filter(n => !ids.includes(n.id) && !n.read).length
      : 0
    );
  };

  return {
    notifications,
    unreadCount,
    markAllAsRead,
    markSelectedAsRead,
    fetchnotifications,
    deletenotifications,
  };
}
