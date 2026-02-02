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

/* NANO ölçüler (desktop’ta da tutarlılık) */
const N_ICON = 14;
const N_ITEM_H = 30;
const N_PX = 7;
const N_GAP = 5;
const N_FONT = 12;

export default function ProfileDropdown({ alwaysVisible = false }) {
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const router = useRouter();
  const dropdownRef = useRef(null);
  const { t } = useTranslation();
  const { ready } = useLocale();
  const { unreadCount } = useNotifications();
  const hasUnread = (unreadCount || 0) > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function handleLogout(e) {
    e.preventDefault();
    if (typeof window !== "undefined") window.location.assign("/api/logout");
    else router.push("/api/logout");
  }

  if (!ready) {
    return (
      <div className="relative flex items-center">
        <button
          className="inline-flex items-center rounded-full border text-white opacity-60"
          style={{ height: N_ITEM_H, padding: `0 ${N_PX}px`, columnGap: N_GAP, fontSize: N_FONT }}
          disabled
        >
          <User2 size={N_ICON} />
          <span className="truncate max-w-[7.5rem]">{user?.name || ""}</span>
        </button>
      </div>
    );
  }

  if (alwaysVisible) return null;

  return (
    <div className="relative flex items-center" ref={dropdownRef} style={{ zIndex: 210 }}>
      {/* Trigger (rozet SAĞ ÜST) */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("profile")}
        className="inline-flex items-center rounded-full border text-white hover:text-[#81d742] hover:border-[#81d742] transition-colors"
        style={{
          height: N_ITEM_H,
          padding: `0 ${N_PX}px`,
          columnGap: N_GAP,
          fontSize: N_FONT,
          lineHeight: `${N_ITEM_H}px`,
          background: "transparent",
          boxShadow: "0 2px 7px rgba(0,0,0,.08)",
          borderColor: "rgba(255,255,255,.9)",
        }}
      >
        <span className="relative inline-flex">
          <User2 size={N_ICON} />
          <NotificationBadge show={hasUnread} size={8} offsetX={-3} offsetY={-3} />
        </span>
        <span className="truncate max-w-[7.5rem] font-mono font-semibold">
          {user?.name || ""}
        </span>
        <svg width="12" height="12" className="ml-1 relative top-[1px]">
          <path d="M3 4.5L6 8l3-3.5" stroke="#81d742" strokeWidth="2" fill="none" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 220,
            borderRadius: 10,
            fontSize: "12.5px",
            padding: "4px 0",
            boxShadow: "0 12px 32px rgba(0,0,0,.22)",
            background: "#181818",
            border: "1px solid #232323",
            zIndex: 211,
          }}
        >
          <Link
            href="/notifications"
            className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] transition"
            onClick={() => setOpen(false)}
          >
            <span className="relative inline-flex items-center">
              <Bell size={16} />
              <NotificationBadge show={hasUnread} size={9} offsetX={-4} offsetY={-4} />
            </span>
            {t("notifications")}
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] transition"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} /> {t("settings")}
          </Link>
          <Link
            href="/support"
            className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] transition"
            onClick={() => setOpen(false)}
          >
            <Headset size={16} /> {t("support")}
          </Link>

          <div className="border-t border-[#232323] my-1" />

          <button
            onClick={handleLogout}
            type="button"
            className="flex items-center gap-3 px-4 py-2 font-mono font-bold text-red-500 hover:text-[#ff7070] transition w-full"
            style={{ background: "transparent", outline: "none" }}
          >
            <LogOut size={16} />
            <span>{t("logout")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
