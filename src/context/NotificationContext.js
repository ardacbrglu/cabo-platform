'use client';
import { Bell } from 'lucide-react';
import { useNotifications} from '@/hooks/useNotifications';

export default function NotificationBell() {
  const { unreadCount } = useNotifications();
  return (
    <div className="relative">
      <Bell size={24} className={unreadCount>0 ? 'text-[#81d742]' : 'text-white'} />
      {unreadCount>0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full px-1 text-xs font-bold">
          {unreadCount}
        </span>
      )}
    </div>
  );
}
