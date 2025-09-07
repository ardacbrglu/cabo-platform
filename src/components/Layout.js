"use client";

/**
 * Authenticated layout — stable footer gap + smooth mobile scroll
 * - Uses .public-shell grid so footer is always just below initial viewport
 * - No inner page scrollers; #cabo-main is sized by the grid
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProfileDropdown from "./ProfileDropdown";
import {
  BarChart2, Link2, ShoppingCart, Wallet2, Home as HomeIcon,
  Menu, Settings, Headset, LogOut, User2, Bell,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationBadge from "@/components/NotificationBadge";

const FOOTER_H = 68; // keep in sync with --public-footer-h

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
    try { history.pushState = patch("pushState"); history.replaceState = patch("replaceState"); } catch {}
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
  useEffect(() => { setMobileOpen(false); setProfileOpen(false); }, [pathname]);

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
    { href: "/mylinks", icon: <Link2 size={22} />, label: t("myLinks") },
    { href: "/performance", icon: <BarChart2 size={22} />, label: t("performance") },
    { href: "/wallet", icon: <Wallet2 size={22} />, label: t("wallet") },
  ];

  function handleLogout() {
    try {
      if (typeof window === "undefined") return;
      document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
      document.cookie = `cabo_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname};`;
      setUser && setUser(null);
      window.location.assign("/api/logout");
    } catch { window.location.href = "/api/logout"; }
  }

  return (
    <div className="public-shell"> {/* grid shell controls header/main/footer heights */}
      {/* HEADER */}
      <header className="public-header flex justify-between items-center px-6 lg:px-8">
        <Link href="/dashboard" prefetch={false} className="brand-cabo select-none" aria-label="Cabo">
          Cabo
        </Link>

        {!isMobile ? (
          <nav aria-label="Main navigation">
            <ul className="flex gap-8 text-sm font-medium items-center">
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
                  <Link2 size={22} /><span>{t("myLinks")}</span>
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
                    <span className="max-w-[9rem] truncate">{(user?.name || "") || t("profile")}</span>
                  </div>
                )}
              </li>
            </ul>
          </nav>
        ) : (
          <div className="flex items-center">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="text-white"
              type="button"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <Menu size={24} />
            </button>
          </div>
        )}
      </header>

      {/* MOBILE PANEL */}
      {isMobile && mobileOpen && (
        <div className="px-6 pb-3 pt-2 bg-[#111] text-sm">
          {[
            { href: "/dashboard", icon: <HomeIcon size={22} />, label: t("home") },
            { href: "/products", icon: <ShoppingCart size={22} />, label: t("productMarket") },
            { href: "/mylinks", icon: <Link2 size={22} />, label: t("myLinks") },
            { href: "/performance", icon: <BarChart2 size={22} />, label: t("performance") },
            { href: "/wallet", icon: <Wallet2 size={22} />, label: t("wallet") },
          ].map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              onClick={() => setMobileOpen(false)}
              className={`block py-2 transition ${ (pathname === href) ? "text-[#81d742] font-semibold" : "text-gray-300 hover:text-white" }`}
            >
              <span className="inline-flex items-center gap-2">{icon}<span>{label}</span></span>
            </Link>
          ))}

          <div className="mt-2 pt-2 border-t border-[#232323]" id="cabo-profile-section">
            {/* … (unchanged profile menu) … */}
          </div>
        </div>
      )}

      {/* CONTENT — sized by grid; no extra min-heights */}
      <main id="cabo-main" className="bg-transparent">
        {children}
      </main>

      {/* FOOTER — always just below first viewport (constant tiny scroll) */}
      <footer
        className="cabo-public-footer w-full text-center text-gray-500 text-xs font-mono border-t border-[#232323] shrink-0"
        role="contentinfo"
        style={{ minHeight: FOOTER_H }}
      >
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
