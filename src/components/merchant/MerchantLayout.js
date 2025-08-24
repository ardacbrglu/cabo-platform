// components/merchant/MerchantLayout.jsx
"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { LogOut, Menu } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function MerchantLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslation(); // merkezi locales + DB pref
  const isMobile = useIsMobile();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");

  useEffect(() => {
    setCurrentPath(pathname || "/");
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [currentPath]);

  // ✅ /api/logout GET → server çerez temizler ve doğru login'e yönlendirir
  function handleLogout() {
    try {
      window.location.assign("/api/logout");
    } catch {
      router.push("/");
    }
  }

  const links = [
    { href: "/merchant/dashboard",           label: t("Manage Products") },
    { href: "/merchant/merchant_payments",   label: t("Payments") },
    { href: "/merchant/merchant_post_logs",  label: t("Post Logs") },
    { href: "/merchant/how_to_integrate",    label: t("How to Integrate") }, // <- FIXED
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
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-400 transition ml-3"
                title={t("Logout")}
                type="button"
              >
                <LogOut size={20} />
              </button>
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
            <button
              onClick={handleLogout}
              className="text-red-500 hover:text-red-400 transition mt-2"
              title={t("Logout")}
              type="button"
            >
              <LogOut size={20} />
            </button>
          </div>
        )}
      </header>

      <main className="max-w-5xl w-full mx-auto mt-8 px-2 pb-24 flex-grow flex flex-col">
        {children}
      </main>

      <footer className="text-center py-5 bg-[#111] text-gray-500 text-xs mt-auto">
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
