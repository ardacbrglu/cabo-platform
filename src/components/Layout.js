"use client";

/**
 * Layout (prod)
 * - Sticky footer: container min-h-[100dvh] + flex-col + main:min-h-0 + footer:mt-auto
 * - Güvenli path: next/navigation hook yok → SSR warning yok
 * - Profil pili: cache adı; ready olunca dropdown
 * - Header/Navigation aynı; kart hover efektleri sayfa içinde
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProfileDropdown from "./ProfileDropdown";
import { BarChart2, Link2, ShoppingCart, Wallet2, Home as HomeIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";

const COLOR_CABO = "#d1ffd0";
const FOOTER_H = 56;

/* ------- güvenli pathname ------- */
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
  const { user, ready } = useUser();
  const { t } = useTranslation();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasAnyUser = !!(user && (user.id || user.userId || user.name || user.email));
  const showProfileDropdown = mounted && hasAnyUser && ready;
  const cachedName = mounted ? (user?.name || "") : "";

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

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-hidden bg-transparent">
      <header className="flex justify-between items-center px-5 py-4 md:px-10 md:py-5 bg-[#111] shadow-sm">
        <h1
          className="text-3xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{ color: COLOR_CABO, letterSpacing: "-0.02em" }}
        >
          Cabo
        </h1>

        {!isMobile ? (
          <nav aria-label="Main navigation">
            <ul className="flex gap-8 text-sm font-medium items-center">
              <li>
                <Link prefetch={false} href="/dashboard"
                  className={navItemClass("/dashboard")} style={navItemStyle}
                  aria-current={isActive("/dashboard") ? "page" : undefined}>
                  <HomeIcon size={22} /><span>{t("home")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/products"
                  className={navItemClass("/products")} style={navItemStyle}
                  aria-current={isActive("/products") ? "page" : undefined}>
                  <ShoppingCart size={22} /><span>{t("productMarket")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/mylinks"
                  className={navItemClass("/mylinks")} style={navItemStyle}
                  aria-current={isActive("/mylinks") ? "page" : undefined}>
                  <Link2 size={22} /><span>{t("myLinks")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/performance"
                  className={navItemClass("/performance")} style={navItemStyle}
                  aria-current={isActive("/performance") ? "page" : undefined}>
                  <BarChart2 size={22} /><span>{t("performance")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/wallet"
                  className={navItemClass("/wallet")} style={navItemStyle}
                  aria-current={isActive("/wallet") ? "page" : undefined}>
                  <Wallet2 size={22} /><span>{t("wallet")}</span>
                </Link>
              </li>

              <li suppressHydrationWarning>
                {showProfileDropdown ? (
                  <ProfileDropdown />
                ) : (
                  <div className="h-9 px-4 rounded-full border border-white/20 bg-white/5 flex items-center text-gray-200">
                    <div className="w-4 h-4 rounded-full bg-white/25 mr-2" />
                    <span className="max-w-[9rem] truncate">
                      {cachedName || t("profile")}
                    </span>
                  </div>
                )}
              </li>
            </ul>
          </nav>
        ) : (
          <nav aria-label="Mobile navigation">{/* mobile hamburger */}</nav>
        )}
      </header>

      {/* main:min-h-0 → iç grid taşsa bile footer her zaman dipte */}
      <main id="cabo-main" className="flex-1 min-h-0">
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
