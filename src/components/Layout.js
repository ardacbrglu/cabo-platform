// src/components/Layout.jsx
"use client";

/**
 * Auth Layout (prod)
 * - Sticky footer: flex column + mt-auto + garantili bottom padding
 * - Güvenli path: next/navigation hooks yok → SSR/Context hatası yok
 * - Profil pili: cache varsa anında isim (ready beklemeden)
 * - Nav hover scale kaldırıldı → titreşim yok
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProfileDropdown from "./ProfileDropdown";
import { BarChart2, Link2, ShoppingCart, Wallet2, Home as HomeIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";

const COLOR_CABO = "#d1ffd0";
const FOOTER_H = 64; // px – görsel olarak rahat

/* ------- Güvenli path hook ------- */
function usePathnameSafe() {
  const [path, setPath] = useState("");
  useEffect(() => {
    const update = () => {
      try { setPath(window.location.pathname || ""); } catch {}
    };
    update();

    // history push/replace patch → custom event
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
  const { user, ready } = useUser();
  const { t } = useTranslation();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Cache’ten gelen isim bile olsa gösterelim (ready beklemeyelim)
  const hasAnyUser = !!(user && (user.id || user.userId || user.name || user.email));
  const showProfileDropdown = mounted && hasAnyUser && ready; // server doğrulanınca dropdown
  const cachedName = mounted ? (user?.name || "") : "";

  const isActive = (path) => pathname === path;
  const navItemClass = (path) =>
    `inline-flex items-center gap-2 transition ${
      isActive(path) ? "text-[#81d742] font-semibold" : "text-gray-200 hover:text-[#81d742]"
    }`;
  const navItemStyle = useMemo(
    () => ({
      display: "inline-flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "0.5rem",
      whiteSpace: "nowrap",
      textAlign: "left",
      padding: "10px 10px",
      // ölçekleme yok → jitter yok
    }),
    []
  );

  return (
    <div
      className="min-h-[100svh] flex flex-col bg-transparent"
      style={{ "--footer-h": `${FOOTER_H}px` }}
    >
      <header className="flex justify-between items-center px-5 py-4 md:px-10 md:py-5 bg-[#111] shadow-sm">
        <h1
          className="text-3xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{ color: COLOR_CABO, letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(129,215,66,0.09)" }}
        >
          Cabo
        </h1>

        {!isMobile ? (
          <nav aria-label="Main navigation">
            <ul className="flex gap-8 text-sm font-medium items-center">
              <li>
                <Link prefetch={false} href="/dashboard" className={navItemClass("/dashboard")} style={navItemStyle}
                      aria-current={isActive("/dashboard") ? "page" : undefined}>
                  <HomeIcon size={22} />
                  <span>{t("home")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/products" className={navItemClass("/products")} style={navItemStyle}
                      aria-current={isActive("/products") ? "page" : undefined}>
                  <ShoppingCart size={22} />
                  <span>{t("productMarket")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/mylinks" className={navItemClass("/mylinks")} style={navItemStyle}
                      aria-current={isActive("/mylinks") ? "page" : undefined}>
                  <Link2 size={22} />
                  <span>{t("myLinks")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/performance" className={navItemClass("/performance")} style={navItemStyle}
                      aria-current={isActive("/performance") ? "page" : undefined}>
                  <BarChart2 size={22} />
                  <span>{t("performance")}</span>
                </Link>
              </li>
              <li>
                <Link prefetch={false} href="/wallet" className={navItemClass("/wallet")} style={navItemStyle}
                      aria-current={isActive("/wallet") ? "page" : undefined}>
                  <Wallet2 size={22} />
                  <span>{t("wallet")}</span>
                </Link>
              </li>

              {/* Profil: hazır değilse bile isimli “pill” → kaybolma yok */}
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
          <nav aria-label="Mobile navigation">{/* mobile hamburger ayrı */}</nav>
        )}
      </header>

      {/* Garantili alt boşluk: tüm sayfalarda footer’dan önce nefes alanı */}
      <main
        id="cabo-main"
        className="flex-1 flex flex-col pb-20 md:pb-28"
        style={{
          paddingBottom: `max(${Math.floor(FOOTER_H * 0.6)}px, env(safe-area-inset-bottom))`,
          minHeight: 0, // child overflow güvenliği
        }}
      >
        {children}
      </main>

      <footer
        className="w-full text-center py-5 bg-[#111] text-gray-500 text-xs font-mono mt-auto border-t border-[#232323]"
        role="contentinfo"
        style={{ minHeight: FOOTER_H }}
      >
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
