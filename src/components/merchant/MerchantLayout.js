"use client";

/**
 * Security Docblock — Cabo PROD
 * Component: MerchantLayout
 * - Client-only; App Router context’inde çalışır
 * - Nav linkleri aktif route’a göre renklendirir
 * - Logout basit <a href="/api/logout"> ile yapılır (idempotent, CSRF gerekmez)
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LogOut, Menu } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function MerchantLayout({ children }) {
  const pathname = usePathname();
  const t = useTranslation();
  const isMobile = useIsMobile();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");

  useEffect(() => {
    setCurrentPath(pathname || "/");
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [currentPath]);

  const links = [
    { href: "/merchant/dashboard",           label: t("Manage Products") },
    { href: "/merchant/merchant_payments",   label: t("Payments") },
    { href: "/merchant/merchant_post_logs",  label: t("Post Logs") },
    { href: "/merchant/how_to_integrate",    label: t("How to Integrate") },
    { href: "/merchant/merchant_support",    label: t("Support") },
    { href: "/merchant/settings",            label: t("Settings") },
  ];

  const linkClass = (href) =>
    `transition hover:text-[#81d742] hover:scale-[1.015] ${
      currentPath === href ? "text-[#81d742] font-semibold" : "text-gray-200"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white font-sans tracking-tight">
      <header className="w-full bg-[#111] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <h1
            className="text-4xl md:text-5xl font-extrabold tracking-tight select-none"
            style={{ color: "#d1ffd0", letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(129,215,66,0.08)" }}
          >
            Cabo
          </h1>

          {isMobile ? (
            <div className="flex items-center">
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="text-white"
                type="button"
                aria-label="Toggle menu"
                aria-expanded={mobileOpen}
              >
                <Menu size={24} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 md:gap-8">
              <nav className="flex gap-2 md:gap-8 items-center text-sm font-medium" aria-label="Merchant">
                {links.map((l) => (
                  <Link key={l.href} href={l.href} className={linkClass(l.href)}>
                    {l.label}
                  </Link>
                ))}
              </nav>

              {/* Basit anchor ile logout */}
              <a
                href="/api/logout"
                className="text-red-500 hover:text-red-400 transition ml-3"
                title={t("Logout")}
              >
                <LogOut size={20} />
              </a>
            </div>
          )}
        </div>

        {isMobile && mobileOpen && (
          <div className="px-6 pb-3 pt-2 bg-[#111] text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={`block py-2 transition ${
                  currentPath === l.href ? "text-[#81d742] font-semibold" : "text-gray-300"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <a
              href="/api/logout"
              className="text-red-500 hover:text-red-400 transition mt-2 inline-flex items-center gap-2"
              title={t("Logout")}
            >
              <LogOut size={20} />
              <span>{t("Logout")}</span>
            </a>
          </div>
        )}
      </header>

      <main
        className="max-w-5xl w-full mx-auto mt-8 px-2 flex-1 flex flex-col"
        style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      <footer className="mt-auto text-center py-5 bg-[#111] text-gray-500 text-xs">
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
