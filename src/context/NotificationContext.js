"use client";

import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";

/**
 * Basit ikon + sayı rozeti (iç sayfalarda kullanılabilir).
 * Eğer sadece nokta istiyorsan mevcut NotificationBadge'i kullanan
 * HamburgerMenu/ProfileDropdown zaten var.
 */
export default function NotificationBell({ size = 24 }) {
  const { unreadCount } = useNotifications();
  const hasUnread = unreadCount > 0;

  return (
    <div className="relative" aria-live="polite" aria-atomic="true">
      <Bell size={size} className={hasUnread ? "text-[#81d742]" : "text-white"} />
      {hasUnread && (
        <span
          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full px-1 text-xs font-bold"
          aria-label={`${unreadCount} unread notifications`}
        >
          {unreadCount}
        </span>
      )}
    </div>
  );
}
