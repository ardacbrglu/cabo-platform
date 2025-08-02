'use client';
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Home, ShoppingCart, Link2, BarChart2, Wallet2,
  Menu, X, Bell, Settings, Headset, LogOut, User2
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useTranslation } from "@/hooks/useTranslation";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBadge from "@/components/NotificationBadge";
import Portal from "@/components/Portal";

export default function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user } = useUser();
  const t = useTranslation(user?.language_preference || "en");
  const pathname = usePathname();
  const { unreadCount } = useNotifications();

  // Dışarı tıklama & ESC
  useEffect(() => {
    function handleClick(e) {
      if (open && !e.target.closest("#cabo-hamburger-panel")) setOpen(false);
      if (profileOpen && !e.target.closest("#cabo-profile-section")) setProfileOpen(false);
    }
    function handleEsc(e) {
      if ((open || profileOpen) && e.key === "Escape") {
        setOpen(false); setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, profileOpen]);

  const handleLogout = () => {
    document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
    window.location.href = "/login";
  };

  const navs = [
    { href: "/dashboard",   icon: <Home size={22} />, label: t("home") },
    { href: "/products",    icon: <ShoppingCart size={22} />, label: t("productMarket") },
    { href: "/mylinks",     icon: <Link2 size={22} />, label: t("myLinks") },
    { href: "/performance", icon: <BarChart2 size={22} />, label: t("performance.title") },
    { href: "/wallet",      icon: <Wallet2 size={22} />, label: t("wallet") },
  ];

  return (
    <>
      {/* Hamburger Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed top-[48px] right-3 z-[40001] bg-[#181818] border border-[#232323] p-2.5 rounded-full shadow-xl transition hover:bg-[#232323] active:scale-95"
          style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
          aria-label="Open Menu"
        >
          <span className="relative">
            <Menu size={27} color="#81d742" />
            <NotificationBadge show={unreadCount > 0} />
          </span>
        </button>
      )}

      {/* Hamburger Panel */}
      <Portal>
        <div className={`fixed inset-0 z-[40000] transition-all duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
          <div className={`absolute inset-0 bg-black/60 transition-all duration-300 ${open ? "backdrop-blur-[4px] opacity-100" : "opacity-0"}`} />
          <div
            id="cabo-hamburger-panel"
            className={`
              absolute top-0 right-0 w-[92vw] max-w-[295px] min-h-[72px]
              rounded-bl-2xl rounded-tl-2xl bg-[#191919] border-l border-[#232323] shadow-2xl flex flex-col
              transition-transform duration-400 ease-in-out
              ${open ? "translate-x-0" : "translate-x-full"}
            `}
            style={{
              boxShadow: "0 2px 42px 10px rgba(0,0,0,0.65)",
              minHeight: "0",
              maxHeight: "98vh"
            }}
          >
            {/* HEADER */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 min-h-[56px] border-b border-[#232323]">
              <span className="flex items-center gap-2 font-mono font-black text-[1.22rem] select-none tracking-widest text-[#d1ffd0]">
                <span className="bg-[#81d742] rounded-lg px-2 py-0.5 text-[#111] text-lg font-black shadow-md">C</span>
                Cabo
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-[#81d742] transition"
                aria-label="Kapat"
                style={{ padding: 8 }}
              >
                <X size={27} />
              </button>
            </div>

            {/* NAV */}
            <nav className="flex flex-col gap-1 px-5 pt-1 pb-2">
              {navs.map(({ href, icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`
                    flex items-center gap-2 py-2 px-3 rounded-lg font-mono font-semibold text-[1.08rem]
                    transition-all
                    ${pathname === href
                      ? "bg-[#212921] text-[#81d742] scale-[1.045] shadow font-extrabold"
                      : "text-white hover:text-[#81d742] hover:bg-[#212921] active:scale-95"}
                  `}
                  style={{ fontWeight: pathname === href ? 800 : 600 }}
                >
                  {icon} <span>{label}</span>
                </Link>
              ))}
            </nav>

            {/* Profil ve alt menü */}
            <div className="mt-auto px-5 pb-4" id="cabo-profile-section">
              {/* Ana profil butonu */}
              <button
                className="w-full flex items-center gap-2 py-2 px-3 rounded-lg font-mono font-bold text-[1.09rem] text-[#81d742] bg-[#181818] transition hover:bg-[#232323] focus:outline-none"
                style={{ minHeight: 44 }}
                onClick={() => setProfileOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={profileOpen}
                aria-label={t("profile")}
                type="button"
              >
                <User2 size={20} />
                <span className="truncate w-full">{user?.name || t("profile")}</span>
                <svg width="16" height="16" className="ml-1 align-middle relative top-[1px]">
                  <path d="M3 6.5L8 11l5-4.5" stroke="#81d742" strokeWidth="2" fill="none" />
                </svg>
                <span className="relative"><NotificationBadge show={unreadCount > 0} size={12} /></span>
              </button>
              {/* Profil iç menü */}
              {profileOpen && (
                <div
                  className="w-full mt-2 rounded-xl bg-[#212921] border border-[#232323] shadow-2xl animate-fadeIn"
                  style={{ background: "#191919", zIndex: 9999, padding: "6px 0 3px 0" }}
                  onClick={e => e.stopPropagation()}
                >
                  <Link href="/notifications" className="flex items-center gap-3 px-5 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition relative" onClick={() => { setProfileOpen(false); setOpen(false); }}>
                    <span className="relative flex items-center">
                      <Bell size={16} />
                      <NotificationBadge show={unreadCount > 0} size={9} />
                    </span>
                    {t("notifications")}
                  </Link>
                  <Link href="/settings" className="flex items-center gap-3 px-5 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition" onClick={() => { setProfileOpen(false); setOpen(false); }}>
                    <Settings size={16} /> {t("settings")}
                  </Link>
                  <Link href="/support" className="flex items-center gap-3 px-5 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition" onClick={() => { setProfileOpen(false); setOpen(false); }}>
                    <Headset size={16} /> {t("support")}
                  </Link>
                  <div className="border-t border-[#232323] my-1" />
                  <button
                    onClick={() => { setProfileOpen(false); setOpen(false); handleLogout(); }}
                    className="flex items-center gap-3 px-5 py-2 font-mono font-bold text-red-500 hover:bg-[#232323] hover:text-[#ff5555] transition w-full"
                    style={{ background: "transparent", outline: "none" }}
                  >
                    <LogOut size={17} />
                    <span>{t("logout")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Portal>
    </>
  );
}
