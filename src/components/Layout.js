"use client";

/**
 * File: src/components/Layout.jsx
 * Purpose: Authenticated shell (navbar + footer).
 * Notes:
 * - Link'lerde prefetch=false: yoğun zamanlarda gereksiz istek atmaz.
 * - Profil dropdown skeleton: hydrate jitter yok.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ProfileDropdown from "./ProfileDropdown";
import { BarChart2, Link2, ShoppingCart, Wallet2, Home as HomeIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";

const COLOR_CABO = "#d1ffd0";

export default function Layout({ children }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { user, ready } = useUser();
  const { t } = useTranslation();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const showProfile = mounted && ready && !!(user && (user.id || user.userId));

  const isActive = (path) => pathname === path;
  const navItemClass = (path) =>
    `inline-flex items-center gap-2 transition hover:text-[#81d742] hover:scale-[1.015] ${
      isActive(path) ? "text-[#81d742] font-semibold" : "text-gray-200"
    }`;
  const navItemStyle = {
    display: "inline-flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "0.5rem",
    whiteSpace: "nowrap",
    textAlign: "left",
    padding: "10px 10px",
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
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

              {/* Profil menüsü: skeleton ile jitter/mismatch önlenir */}
              <li suppressHydrationWarning>
                {showProfile ? (
                  <ProfileDropdown />
                ) : (
                  <div className="h-9 px-6 rounded-full border border-white/20 bg-white/5 flex items-center">
                    <span className="w-16 h-3 bg-white/15 rounded animate-pulse" />
                  </div>
                )}
              </li>
            </ul>
          </nav>
        ) : (
          <nav aria-label="Mobile navigation">{/* opsiyonel */}</nav>
        )}
      </header>

      <main className="flex-1 flex flex-col">{children}</main>

      <footer className="w-full text-center py-5 bg-[#111] text-gray-500 text-xs font-mono mt-auto">
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
