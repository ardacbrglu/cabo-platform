// src/components/ProfileDropdown.jsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User2, LogOut, Bell, Settings, Headset } from "lucide-react";
import useTranslation from "@/hooks/useTranslation";
import { useLocale } from "@/context/LocaleContext";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBadge from "@/components/NotificationBadge";

export default function ProfileDropdown({ alwaysVisible = false }) {
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const router = useRouter();
  const dropdownRef = useRef();
  const { t } = useTranslation();
  const { ready } = useLocale();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  function handleLogout(e) {
    e.preventDefault();
    if (typeof window !== "undefined") {
      window.location.assign("/api/logout");
    } else {
      router.push("/api/logout");
    }
  }

  if (!ready) {
    return (
      <div className="relative flex items-center">
        <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-white text-white opacity-60" disabled>
          <User2 size={20} />
          <span className="truncate">{user?.name || ""}</span>
        </button>
      </div>
    );
  }

  if (alwaysVisible) return null;

  return (
    <div className="relative flex items-center" ref={dropdownRef} style={{ zIndex: 210 }}>
      {/* Profile Button + Notification Badge */}
      <button
        className="inline-flex flex-row items-center gap-2 px-3 py-1.5 rounded-full border-2 border-white font-mono font-bold text-[1.07rem] text-white transition bg-transparent shadow-sm hover:border-[#81d742] hover:text-[#81d742] focus:outline-none relative"
        style={{
          minHeight: 38,
          fontWeight: 700,
          display: "inline-flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "0.5rem",
          boxShadow: "0 2px 7px rgba(0,0,0,0.09)",
        }}
        onClick={() => setOpen(!open)}
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("profile")}
        type="button"
      >
        <span className="relative">
          <User2 size={20} />
          {/* Tek tip kırmızı notification dot */}
          <NotificationBadge show={unreadCount > 0} size={10} />
        </span>
        <span className="truncate max-w-[90px]">{user?.name || ""}</span>
        <svg width="16" height="16" className="ml-1 align-middle relative top-[1px]">
          <path d="M3 6.5L8 11l5-4.5" stroke="#81d742" strokeWidth="2" fill="none" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 10px)",
            minWidth: 230,
            borderRadius: 12,
            fontSize: "0.99rem",
            padding: "0.35em 0 0.25em 0",
            boxShadow: "0 12px 36px rgba(0,0,0,0.22)",
            background: "#181818",
            border: "1px solid #232323",
            zIndex: 211,
          }}
          className="animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <Link
            href="/notifications"
            className="flex items-center gap-3 px-5 py-2 font-mono font-bold text-white hover:text-[#81d742] transition relative"
            onClick={() => setOpen(false)}
          >
            <span className="relative flex items-center">
              <Bell size={16} />
              <NotificationBadge show={unreadCount > 0} size={9} />
            </span>
            {t("notifications")}
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-3 px-5 py-2 font-mono font-bold text-white hover:text-[#81d742] transition"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} /> {t("settings")}
          </Link>
          <Link
            href="/support"
            className="flex items-center gap-3 px-5 py-2 font-mono font-bold text-white hover:text-[#81d742] transition"
            onClick={() => setOpen(false)}
          >
            <Headset size={16} /> {t("support")}
          </Link>
          <div className="border-t border-[#232323] my-1" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-5 py-2 font-mono font-bold text-red-500 transition w-full"
            style={{ background: "transparent", outline: "none" }}
            type="button"
          >
            <LogOut size={16} />
            <span>{t("logout")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
