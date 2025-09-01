// src/components/Layout.jsx
"use client";

/**
 * File: src/components/Layout.jsx
 * Purpose: Authenticated (affiliate) layout
 *
 * Security/UX Docblock:
 * - Desktop nav yapısı korundu, UI/stil bozulmadı.
 * - Mobile nav: header sağında hamburger; başlık altına açılan panel.
 * - Bildirim rozeti: unread varsa desktop’ta Bell linkinde, mobilde hamburger üstünde ve menü içindeki Notifications satırında.
 * - Rota değişince mobil panel otomatik kapanır (history patch + popstate).
 * - Erişilebilirlik: aria-label, aria-expanded; butonlar klavye ile erişilebilir.
 * - Kaydırma: ana <main> “mobile-untrap-scroll” ile nested-scroll kilitlenmesi engellendi.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProfileDropdown from "./ProfileDropdown";
import {
  BarChart2,
  Link2,
  ShoppingCart,
  Wallet2,
  Home as HomeIcon,
  Menu,
  Bell,
  Settings,
  Headset,
  LogOut,
  User2,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBadge from "@/components/NotificationBadge";

const COLOR_CABO = "#d1ffd0";
const FOOTER_H = 56;

/* ------- güvenli pathname ------- */
function usePathnameSafe() {
  const [path, setPath] = useState("");
  useEffect(() => {
    const update = () => {
      try {
        setPath(window.location.pathname || "");
      } catch {}
    };
    update();

    const patch = (type) => {
      const orig = history[type];
      return function (...args) {
        const ret = orig.apply(this, args);
        try {
          window.dispatchEvent(new Event("locationchange"));
        } catch {}
        return ret;
      };
    };
    try {
      history.pushState = patch("pushState");
      history.replaceState = patch("replaceState");
    } catch {}

    window.addEventListener("popstate", update);
    window.addEventListener("locationchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("locationchange", update);
    };
  }, []);
  return path;
}

export default function Layout({ children }) {
  const pathname = usePathnameSafe();
  const isMobile = useIsMobile();
  const { user, ready, setUser } = useUser();
  const { t } = useTranslation();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // rota değişince mobil paneli kapat
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  const hasAnyUser = !!(user && (user.id || user.userId || user.name || user.email));
  const showProfileDropdown = mounted && hasAnyUser && ready;
  const cachedName = mounted ? (user?.name || "") : "";

  // Bildirimler (sadece login iken poll et)
  const { unreadCount } = useNotifications(Boolean(hasAnyUser));
  const hasUnread = unreadCount > 0;

  const isActive = (path) => pathname === path;
  const navItemClass = (path) =>
    `inline-flex items-center gap-2 ${
      isActive(path) ? "text-[#81d742] font-semibold" : "text-gray-200 hover:text-[#81d742]"
    }`;
  const navItemStyle = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      gap: "0.5rem",
      whiteSpace: "nowrap",
      padding: "10px 10px",
    }),
    []
  );

  const mobileLinks = [
    { href: "/dashboard", icon: <HomeIcon size={22} />, label: t("home") },
    { href: "/products", icon: <ShoppingCart size={22} />, label: t("productMarket") },
    { href: "/mylinks", icon: <Link2 size={22} />, label: t("myLinks") },
    { href: "/performance", icon: <BarChart2 size={22} />, label: t("performance") },
    { href: "/wallet", icon: <Wallet2 size={22} />, label: t("wallet") },
  ];

  function handleLogout() {
    try {
      if (typeof window !== "undefined") {
        document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
        document.cookie = `cabo_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname};`;
        setUser && setUser(null);
        window.location.assign("/api/logout");
      }
    } catch {
      window.location.href = "/api/logout";
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-hidden bg-transparent">
      {/* HEADER */}
      <header className="flex justify-between items-center px-5 py-4 md:px-10 md:py-5 bg-[#111] shadow-sm">
        <h1
          className="text-3xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{ color: COLOR_CABO, letterSpacing: "-0.02em" }}
        >
          Cabo
        </h1>

        {/* DESKTOP NAV */}
        {!isMobile ? (
          <nav aria-label="Main navigation">
            <ul className="flex gap-8 text-sm font-medium items-center">
              <li>
                <Link
                  prefetch={false}
                  href="/dashboard"
                  className={navItemClass("/dashboard")}
                  style={navItemStyle}
                  aria-current={isActive("/dashboard") ? "page" : undefined}
                >
                  <HomeIcon size={22} />
                  <span>{t("home")}</span>
                </Link>
              </li>
              <li>
                <Link
                  prefetch={false}
                  href="/products"
                  className={navItemClass("/products")}
                  style={navItemStyle}
                  aria-current={isActive("/products") ? "page" : undefined}
                >
                  <ShoppingCart size={22} />
                  <span>{t("productMarket")}</span>
                </Link>
              </li>
              <li>
                <Link
                  prefetch={false}
                  href="/mylinks"
                  className={navItemClass("/mylinks")}
                  style={navItemStyle}
                  aria-current={isActive("/mylinks") ? "page" : undefined}
                >
                  <Link2 size={22} />
                  <span>{t("myLinks")}</span>
                </Link>
              </li>
              <li>
                <Link
                  prefetch={false}
                  href="/performance"
                  className={navItemClass("/performance")}
                  style={navItemStyle}
                  aria-current={isActive("/performance") ? "page" : undefined}
                >
                  <BarChart2 size={22} />
                  <span>{t("performance")}</span>
                </Link>
              </li>
              <li>
                <Link
                  prefetch={false}
                  href="/wallet"
                  className={navItemClass("/wallet")}
                  style={navItemStyle}
                  aria-current={isActive("/wallet") ? "page" : undefined}
                >
                  <Wallet2 size={22} />
                  <span>{t("wallet")}</span>
                </Link>
              </li>

              {/* DESKTOP NOTIFICATIONS (zil + badge) */}
              <li className="relative">
                <Link
                  prefetch={false}
                  href="/notifications"
                  className="inline-flex items-center gap-2 text-gray-200 hover:text-[#81d742] px-2 py-1"
                  aria-label={hasUnread ? `${t("notifications")} (${unreadCount})` : t("notifications")}
                >
                  <span className="relative inline-block">
                    <Bell size={22} />
                    <NotificationBadge show={hasUnread} size={10} offsetX={-3} offsetY={-3} />
                  </span>
                  <span className="hidden md:inline">{t("notifications")}</span>
                </Link>
              </li>

              <li suppressHydrationWarning>
                {showProfileDropdown ? (
                  <ProfileDropdown />
                ) : (
                  <div className="h-9 px-4 rounded-full border border-white/20 bg-white/5 flex items-center text-gray-200">
                    <div className="w-4 h-4 rounded-full bg-white/25 mr-2" />
                    <span className="max-w-[9rem] truncate">{cachedName || t("profile")}</span>
                  </div>
                )}
              </li>
            </ul>
          </nav>
        ) : (
          // MOBILE HEADER — hamburger (badge üstünde)
          <div className="flex items-center">
            <div className="relative">
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="text-white"
                type="button"
                aria-label={hasUnread ? `${t("notifications")} (${unreadCount})` : "Toggle menu"}
                aria-expanded={mobileOpen}
              >
                <Menu size={24} />
              </button>
              <NotificationBadge show={hasUnread} size={9} offsetX={-2} offsetY={-3} />
            </div>
          </div>
        )}
      </header>

      {/* MOBILE PANEL */}
      {isMobile && mobileOpen && (
        <div className="px-6 pb-3 pt-2 bg-[#111] text-sm">
          {mobileLinks.map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              onClick={() => setMobileOpen(false)}
              className={`block py-2 transition ${
                isActive(href) ? "text-[#81d742] font-semibold" : "text-gray-300 hover:text-white"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {icon}
                <span>{label}</span>
              </span>
            </Link>
          ))}

          {/* Profil bölümü (ikonlu alt menü) */}
          <div className="mt-2 pt-2 border-t border-[#232323]" id="cabo-profile-section">
            {/* Notifications satırı (inline dot) */}
            <Link
              href="/notifications"
              prefetch={false}
              className="flex items-center gap-3 px-0 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-transparent transition"
              onClick={() => {
                setProfileOpen(false);
                setMobileOpen(false);
              }}
              aria-label={hasUnread ? `${t("notifications")} (${unreadCount})` : t("notifications")}
            >
              <span className="relative inline-flex items-center">
                <Bell size={16} />
                {hasUnread && <span className="ml-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />}
              </span>
              {t("notifications")}
            </Link>

            <button
              className="w-full flex items-center gap-2 py-2 px-0 font-mono font-bold text-[1.02rem] text-[#81d742] transition hover:text-[#a9ff72] focus:outline-none"
              style={{ minHeight: 40 }}
              onClick={() => setProfileOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={profileOpen}
              aria-label={t("profile")}
              type="button"
            >
              <User2 size={18} />
              <span className="truncate w-full">{user?.name || t("profile")}</span>
              <svg width="14" height="14" className="ml-1 align-middle relative top-[1px]">
                <path d="M3 6.5L8 11l5-4.5" stroke="#81d742" strokeWidth="2" fill="none" />
              </svg>
            </button>

            {profileOpen && (
              <div className="w-full mt-1 rounded-lg border border-[#232323] bg-[#191919] shadow-xl">
                <Link
                  href="/settings"
                  prefetch={false}
                  className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition"
                  onClick={() => {
                    setProfileOpen(false);
                    setMobileOpen(false);
                  }}
                >
                  <Settings size={16} /> {t("settings")}
                </Link>
                <Link
                  href="/support"
                  prefetch={false}
                  className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition"
                  onClick={() => {
                    setProfileOpen(false);
                    setMobileOpen(false);
                  }}
                >
                  <Headset size={16} /> {t("support")}
                </Link>
                <div className="border-t border-[#232323]" />
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setMobileOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center gap-3 px-4 py-2 font-mono font-bold text-red-500 hover:bg-[#232323] hover:text-[#ff6666] transition w-full"
                  style={{ background: "transparent", outline: "none" }}
                  type="button"
                >
                  <LogOut size={16} />
                  <span>{t("logout")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* main:min-h-0 → iç grid taşsa bile footer her zaman dipte
          mobile-untrap-scroll → globalde tanımlı; nested scroll kilidi çözülür */}
      <main id="cabo-main" className="flex-1 min-h-0 mobile-untrap-scroll">
        {children}
      </main>

      <footer
        className="w-full text-center bg-[#111] text-gray-500 text-xs font-mono mt-auto border-t border-[#232323] shrink-0"
        role="contentinfo"
        style={{ height: FOOTER_H, lineHeight: `${FOOTER_H}px` }}
      >
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
