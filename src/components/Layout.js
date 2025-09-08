"use client";

/**
 * Clean layout (AFFILIATE/PRIVATE)
 * - Mobile menü: PUBLIC layout ile aynı; header içinde edge-band olarak tam genişlikte akar
 * - Overlay yok; header overflow-visible + yüksek z-index → içerik üstünde kalır
 * - Bildirim badge davranışı korunur
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProfileDropdown from "./ProfileDropdown";
import NotificationBadge from "@/components/NotificationBadge";
import {
  BarChart2, Link2 as LinkIcon, ShoppingCart, Wallet2,
  Home as HomeIcon, Menu, Settings, Headset, LogOut, User2, Bell,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { useNotifications } from "@/hooks/useNotifications";

const FOOTER_H = 56;

function usePathnameSafe() {
  const [path, setPath] = useState("");
  useEffect(() => {
    const update = () => { try { setPath(window.location.pathname || ""); } catch {} };
    update();
    const patch = (type) => {
      const orig = history[type];
      return function (...args) {
        const ret = orig.apply(this, args);
        try { window.dispatchEvent(new Event("locationchange")); } catch {}
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

  // sayfa değişince panel/dp kapansın
  useEffect(() => { setMobileOpen(false); setProfileOpen(false); }, [pathname]);

  // ESC ile kapat
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setMobileOpen(false); setProfileOpen(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const hasAnyUser = !!(user && (user.id || user.userId || user.name || user.email));
  const showProfileDropdown = mounted && hasAnyUser && ready;
  const cachedName = mounted ? (user?.name || "") : "";

  const { unreadCount } = useNotifications(Boolean(hasAnyUser));
  const hasUnread = unreadCount > 0;

  const isActive = (path) => pathname === path;
  const navItemClass = (path) =>
    `inline-flex items-center gap-2 ${isActive(path) ? "text-[#81d742] font-semibold" : "text-gray-200 hover:text-[#81d742]"}`;
  const navItemStyle = useMemo(
    () => ({ display: "inline-flex", alignItems: "center", gap: "0.5rem", whiteSpace: "nowrap", padding: "10px 10px" }),
    []
  );

  const mobileLinks = [
    { href: "/dashboard", icon: <HomeIcon size={22} />, label: t("home") },
    { href: "/products", icon: <ShoppingCart size={22} />, label: t("productMarket") },
    { href: "/mylinks", icon: <LinkIcon size={22} />, label: t("myLinks") },
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
    } catch { window.location.href = "/api/logout"; }
  }

  return (
    <div className="app-shell">
      {/* HEADER — public ile aynı: sabit yükseklikli bar + altında akışkan mobil panel */}
      <header
        className="app-header relative z-[12000]"   // yüksek z-index + stacking
        style={{ overflow: "visible" }}             // panel header dışına taşabilsin
      >
        <div className="edge-band h-full flex items-center justify-between">
          <Link href="/dashboard" prefetch={false} className="brand-cabo select-none" aria-label="Cabo">
            Cabo
          </Link>

          {!isMobile ? (
            <nav aria-label="Main navigation">
              <ul className="flex gap-7 text-sm font-medium items-center">
                <li>
                  <Link prefetch={false} href="/dashboard" className={navItemClass("/dashboard")} style={navItemStyle} aria-current={isActive("/dashboard") ? "page" : undefined}>
                    <HomeIcon size={22} /><span>{t("home")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/products" className={navItemClass("/products")} style={navItemStyle} aria-current={isActive("/products") ? "page" : undefined}>
                    <ShoppingCart size={22} /><span>{t("productMarket")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/mylinks" className={navItemClass("/mylinks")} style={navItemStyle} aria-current={isActive("/mylinks") ? "page" : undefined}>
                    <LinkIcon size={22} /><span>{t("myLinks")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/performance" className={navItemClass("/performance")} style={navItemStyle} aria-current={isActive("/performance") ? "page" : undefined}>
                    <BarChart2 size={22} /><span>{t("performance")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/wallet" className={navItemClass("/wallet")} style={navItemStyle} aria-current={isActive("/wallet") ? "page" : undefined}>
                    <Wallet2 size={22} /><span>{t("wallet")}</span>
                  </Link>
                </li>

                <li className="relative" suppressHydrationWarning>
                  {showProfileDropdown ? (
                    <div className="relative inline-block align-middle">
                      <ProfileDropdown />
                      <div className="absolute -top-1 -right-1 pointer-events-none">
                        <NotificationBadge show={hasUnread} size={10} />
                      </div>
                    </div>
                  ) : (
                    <div className="h-9 px-4 rounded-full border border-white/20 bg-white/5 flex items-center text-gray-200 relative">
                      <div className="w-4 h-4 rounded-full bg-white/25 mr-2 relative">
                        <div className="absolute -top-1 -right-1">
                          <NotificationBadge show={hasUnread} size={10} />
                        </div>
                      </div>
                      <span className="max-w-[9rem] truncate">{cachedName || t("profile")}</span>
                    </div>
                  )}
                </li>
              </ul>
            </nav>
          ) : (
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="text-white"
              type="button"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <Menu size={24} />
            </button>
          )}
        </div>

        {/* MOBILE panel — PUBLIC ile aynı: header içinde, edge-band + tam genişlik, border yok */}
        {isMobile && mobileOpen && (
          <div className="edge-band pb-3 pt-2 bg-[#111] text-sm allow-inner-scroll">
            {mobileLinks.map(({ href, icon, label }) => (
              <Link
                key={href}
                href={href}
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`block py-2 transition ${isActive(href) ? "text-[#81d742] font-semibold" : "text-gray-300 hover:text-white"}`}
              >
                <span className="inline-flex items-center gap-2">{icon}<span>{label}</span></span>
              </Link>
            ))}

            {/* Profile bölümü — panel ile aynı genişlikte açılır */}
            <div className="mt-2 pt-2 border-t border-[#232323]" id="cabo-profile-section">
              <button
                className="w-full flex items-center gap-2 py-2 font-mono font-bold text-[1.02rem] text-[#81d742] transition hover:text-[#a9ff72] focus:outline-none"
                style={{ minHeight: 40 }}
                onClick={() => setProfileOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={profileOpen}
                aria-label={t("profile")}
                type="button"
              >
                <span className="relative">
                  <User2 size={18} />
                  <NotificationBadge show={hasUnread} size={9} offsetX={-5} offsetY={-5} />
                </span>
                <span className="truncate w-full">{user?.name || t("profile")}</span>
                <svg width="14" height="14" className="ml-1 align-middle relative top-[1px]">
                  <path d="M3 6.5L8 11l5-4.5" stroke="#81d742" strokeWidth="2" fill="none" />
                </svg>
              </button>

              {profileOpen && (
                <div className="w-full mt-1 rounded-lg border border-[#232323] bg-[#191919] shadow-xl allow-inner-scroll">
                  <Link
                    href="/notifications"
                    prefetch={false}
                    className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition"
                    onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                  >
                    <span className="relative inline-flex items-center">
                      <Bell size={16} />
                      <NotificationBadge show={hasUnread} size={9} />
                    </span>
                    {t("notifications")}
                  </Link>
                  <Link
                    href="/settings"
                    prefetch={false}
                    className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition"
                    onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                  >
                    <Settings size={16} /> {t("settings")}
                  </Link>
                  <Link
                    href="/support"
                    prefetch={false}
                    className="flex items-center gap-3 px-4 py-2 font-mono font-semibold text-white hover:text-[#81d742] hover:bg-[#222e22] transition"
                    onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                  >
                    <Headset size={16} /> {t("support")}
                  </Link>
                  <div className="border-t border-[#232323]" />
                  <button
                    onClick={() => { setProfileOpen(false); setMobileOpen(false); handleLogout(); }}
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
      </header>

      {/* CONTENT */}
      <main id="cabo-main" className="bg-transparent">
        <div className="container">{children}</div>
      </main>

      {/* FOOTER */}
      <footer
        className="app-footer text-gray-500 text-xs font-mono border-t border-[#232323] shrink-0"
        role="contentinfo"
        style={{ height: FOOTER_H, lineHeight: `${FOOTER_H}px` }}
      >
        <div className="edge-band">
          <div className="footer-inner text-center w-full">
            &copy; 2025 Cabo Affiliate&nbsp;|&nbsp;Built by Arda Cabaroğlu
          </div>
        </div>
      </footer>
    </div>
  );
}
