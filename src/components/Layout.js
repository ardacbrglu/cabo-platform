"use client";

/**
 * Private Layout (Affiliate) — Mobile panel = PublicLayout style (pure JS)
 * NANO desktop görünüm: ikon/metin/padding/gap küçültüldü.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import Portal from "@/components/Portal";

const FOOTER_H = 56;

/* ===== Desktop ölçüleri — NANO ===== */
const DESKTOP_ICON = 14;
const DESKTOP_ITEM_H = 30;
const DESKTOP_ITEM_PX = 7;
const DESKTOP_ICON_TEXT_GAP = 5;
const DESKTOP_LI_GAP = 14;
const DESKTOP_FONT_PX = 12;

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
  const { unreadCount } = useNotifications(Boolean(user));

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const headerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => { setMobileOpen(false); setProfileOpen(false); }, [pathname]);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") { setMobileOpen(false); setProfileOpen(false); } };
    const onDown = (e) => {
      if (!mobileOpen) return;
      const tgt = e.target;
      if (!panelRef.current || !headerRef.current) return;
      const insidePanel = panelRef.current.contains(tgt);
      const insideHeader = headerRef.current.contains(tgt);
      const onButton = buttonRef.current && buttonRef.current.contains(tgt);
      if (!insidePanel && !insideHeader && !onButton) { setMobileOpen(false); setProfileOpen(false); }
    };
    document.addEventListener("keydown", onEsc);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [mobileOpen]);

  const hasAnyUser = !!(user && (user.id || user.userId || user.name || user.email));
  const showProfileDropdown = mounted && hasAnyUser && ready;
  const cachedName = mounted ? (user?.name || "") : "";
  const hasUnread = (unreadCount || 0) > 0;

  const isActive = (path) => pathname === path;

  const navItemClass = (path) =>
    `inline-flex ${isActive(path) ? "text-[#81d742] font-semibold" : "text-gray-200 hover:text-[#81d742]"}`;

  const navItemStyle = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      height: DESKTOP_ITEM_H,
      lineHeight: `${DESKTOP_ITEM_H}px`,
      padding: `0 ${DESKTOP_ITEM_PX}px`,
      columnGap: DESKTOP_ICON_TEXT_GAP,
      whiteSpace: "nowrap",
      borderRadius: 9999,
    }),
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

  const mustRedirect =
    ready &&
    (!user?.id || user?.status !== "active" || !["affiliate", "admin"].includes(user?.role || "affiliate"));

  useEffect(() => {
    if (!mustRedirect) return;
    try {
      const from =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : pathname || "/performance";
      window.location.replace(`/login?from=${encodeURIComponent(from)}`);
    } catch {}
  }, [mustRedirect, pathname]);

  if (!ready || mustRedirect) return null;

  return (
    <div className="app-shell">
      {/* HEADER */}
      <header ref={headerRef} className="app-header relative z-[12000]" style={{ overflow: "visible", position: "relative" }}>
        <div className="edge-band h-full flex items-center justify-between">
          <Link href="/dashboard" prefetch={false} className="brand-cabo select-none" aria-label="Cabo">Cabo</Link>

          {/* Desktop nav */}
          {!isMobile ? (
            <nav aria-label="Main navigation">
              <ul className="flex items-center font-medium" style={{ columnGap: DESKTOP_LI_GAP, fontSize: `${DESKTOP_FONT_PX}px` }}>
                <li>
                  <Link prefetch={false} href="/dashboard" className={navItemClass("/dashboard")} style={navItemStyle} aria-current={isActive("/dashboard") ? "page" : undefined}>
                    <HomeIcon size={DESKTOP_ICON} /><span>{t("home")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/products" className={navItemClass("/products")} style={navItemStyle} aria-current={isActive("/products") ? "page" : undefined}>
                    <ShoppingCart size={DESKTOP_ICON} /><span>{t("productMarket")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/mylinks" className={navItemClass("/mylinks")} style={navItemStyle} aria-current={isActive("/mylinks") ? "page" : undefined}>
                    <LinkIcon size={DESKTOP_ICON} /><span>{t("myLinks")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/performance" className={navItemClass("/performance")} style={navItemStyle} aria-current={isActive("/performance") ? "page" : undefined}>
                    <BarChart2 size={DESKTOP_ICON} /><span>{t("performance")}</span>
                  </Link>
                </li>
                <li>
                  <Link prefetch={false} href="/wallet" className={navItemClass("/wallet")} style={navItemStyle} aria-current={isActive("/wallet") ? "page" : undefined}>
                    <Wallet2 size={DESKTOP_ICON} /><span>{t("wallet")}</span>
                  </Link>
                </li>

                {/* Desktop profil — tek rozet ProfileDropdown içinde */}
                <li className="relative" suppressHydrationWarning>
                  {showProfileDropdown ? (
                    <ProfileDropdown />
                  ) : (
                    <div
                      className="rounded-full border border-white/20 bg-white/5 text-gray-200 relative"
                      style={{
                        height: DESKTOP_ITEM_H,
                        lineHeight: `${DESKTOP_ITEM_H}px`,
                        padding: `0 ${DESKTOP_ITEM_PX}px`,
                        display: "inline-flex",
                        alignItems: "center",
                        columnGap: DESKTOP_ICON_TEXT_GAP,
                      }}
                    >
                      <div className="rounded-full bg-white/25 relative" style={{ width: DESKTOP_ICON, height: DESKTOP_ICON }}>
                        <div className="absolute -top-[3px] -right-[3px]">
                          <NotificationBadge show={hasUnread} size={8} />
                        </div>
                      </div>
                      <span className="max-w-[8rem] truncate">{(user?.name || cachedName || t("profile"))}</span>
                    </div>
                  )}
                </li>
              </ul>
            </nav>
          ) : (
            // ==== MOBİL: Hamburger (Menu) + ROZET SAĞ-ÜST ====
            <button
              ref={buttonRef}
              onClick={() => setMobileOpen(v => !v)}
              className="text-white relative"
              type="button"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <span className="relative inline-flex">
                <Menu size={24} />
                <NotificationBadge show={hasUnread} size={9} offsetX={-4} offsetY={-4} />
              </span>
            </button>
          )}
        </div>
      </header>

      {/* MOBILE PANEL */}
      {isMobile && (
        <Portal>
          <div
            ref={panelRef}
            id="cabo-toplayer-panel"
            className="pointer-events-auto"
            style={{
              position: "fixed",
              left: 0, right: 0, top: "calc(var(--header-h))",
              width: "100vw",
              zIndex: 2147483647,
              transform: mobileOpen ? "translate3d(0,0,0)" : "translate3d(0,-8px,0)",
              opacity: mobileOpen ? 1 : 0,
              transition: "opacity .18s ease, transform .18s ease",
              pointerEvents: mobileOpen ? "auto" : "none",
              WebkitTapHighlightColor: "transparent",
            }}
            role="dialog" aria-modal="true" aria-hidden={!mobileOpen}
          >
            <div
              className="edge-band text-sm allow-inner-scroll"
              style={{
                background: "#111",
                paddingTop: "8px",
                paddingBottom: "12px",
                maxHeight: "min(92vh, 560px)",
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
                boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
                borderBottom: "1px solid #232323",
              }}
            >
              {[
                { href: "/dashboard", icon: <HomeIcon size={22} />, label: t("home") },
                { href: "/products", icon: <ShoppingCart size={22} />, label: t("productMarket") },
                { href: "/mylinks", icon: <LinkIcon size={22} />, label: t("myLinks") },
                { href: "/performance", icon: <BarChart2 size={22} />, label: t("performance") },
                { href: "/wallet", icon: <Wallet2 size={22} />, label: t("wallet") },
              ].map(({ href, icon, label }) => (
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

              {/* Profile block (mobile) — rozet var */}
              <div className="mt-2 pt-2 border-t border-[#232323]" id="cabo-profile-section">
                <button
                  className="w-full flex items-center gap-2 py-2 font-mono font-bold text-[1.02rem] text-[#81d742] transition hover:text-[#a9ff72] focus:outline-none"
                  style={{ minHeight: 40 }}
                  onClick={() => setProfileOpen(v => !v)}
                  aria-haspopup="true"
                  aria-expanded={profileOpen}
                  aria-label={t("profile")}
                  type="button"
                >
                  <span className="relative inline-flex">
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
                        <NotificationBadge show={hasUnread} size={9} offsetX={-4} offsetY={-4} />
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
          </div>
        </Portal>
      )}

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
