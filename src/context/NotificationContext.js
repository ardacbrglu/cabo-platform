// /components/NotificationBell.jsx
"use client";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";

export default function NotificationBell() {
  const { unreadCount } = useNotifications();
  const hasUnread = unreadCount > 0;

  return (
    <button
      type="button"
      className="relative"
      aria-label={hasUnread ? `You have ${unreadCount} unread notifications` : "Notifications"}
    >
      <Bell size={24} className={hasUnread ? "text-[#81d742]" : "text-white"} />
      {hasUnread && (
        <span
          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full px-1 text-xs font-bold"
          aria-hidden="true"
        >
          {unreadCount}
        </span>
      )}
    </button>
  );
}
