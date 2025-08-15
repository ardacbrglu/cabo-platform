"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LogOut, Menu } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCsrfToken } from "@/hooks/useCsrfToken";

// SSR uyumlu locale seçici (localStorage tabanlı)
const useLocaleSSR = () => {
  const [locale, setLocale] = useState("en");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("locale");
      if (stored) setLocale(stored);
    } catch {/* no-op */}
  }, []);
  const handleLangChange = (lng) => {
    try {
      setLocale(lng);
      localStorage.setItem("locale", lng);
    } catch {/* no-op */}
    window.location.reload();
  };
  return [locale, handleLangChange];
};

export default function MerchantLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslation();
  const isMobile = useIsMobile();
  const [locale, handleLangChange] = useLocaleSSR();

  const { csrfToken, ready: csrfReady } = useCsrfToken();

  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function handleLogout() {
    try {
      if (csrfReady && csrfToken) {
        await fetch("/api/logout", {
          method: "POST",
          credentials: "include",
          headers: { "x-csrf-token": csrfToken },
        });
      }
    } catch {
      // sessiz geç
    } finally {
      // eski custom cookie temizliği (ekstra)
      document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      router.push("/");
    }
  }

  const links = [
    { href: "/merchant/dashboard", label: t("Manage Products") },
    { href: "/merchant/merchant_payments", label: t("Payments") },
    { href: "/merchant/merchant_info", label: t("How to Integrate") },
    { href: "/merchant/merchant_support", label: t("Support") },
    { href: "/merchant/merchant_settings", label: t("Settings") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white font-sans tracking-tight">
      <header className="w-full bg-[#111] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          {/* LOGO */}
          <h1
            className="text-4xl md:text-5xl font-extrabold tracking-tight select-none"
            style={{
              color: "#d1ffd0",
              letterSpacing: "-0.02em",
              textShadow: "0 2px 12px rgba(129,215,66,0.08)",
            }}
          >
            Cabo
          </h1>

          {isMobile ? (
            <div className="flex gap-1 items-center">
              <button
                onClick={() => handleLangChange("en")}
                className={`p-1 rounded text-xs font-bold ${locale === "en" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
                title="English"
                type="button"
              >EN</button>
              <button
                onClick={() => handleLangChange("tr")}
                className={`p-1 rounded text-xs font-bold ${locale === "tr" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
                title="Türkçe"
                type="button"
              >TR</button>
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="text-white ml-1"
                title="Menu"
                type="button"
                aria-label="Toggle menu"
                aria-expanded={mobileOpen}
                aria-controls="merchant-mobile-nav"
              >
                <Menu size={24} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 md:gap-8">
              <nav className="flex gap-2 md:gap-8 items-center text-sm font-medium" aria-label="Merchant">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`transition hover:text-[#81d742] hover:scale-[1.015] ${
                      pathname === link.href ? "text-[#81d742] font-semibold" : "text-gray-200"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => handleLangChange("en")}
                  className={`p-1 rounded ${locale === "en" ? "bg-[#81d742] text-[#101010] font-bold" : "text-gray-300"}`}
                  title="English"
                  type="button"
                >EN</button>
                <button
                  onClick={() => handleLangChange("tr")}
                  className={`p-1 rounded ${locale === "tr" ? "bg-[#81d742] text-[#101010] font-bold" : "text-gray-300"}`}
                  title="Türkçe"
                  type="button"
                >TR</button>
              </div>
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-400 transition ml-3"
                title="Logout"
                type="button"
              >
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>

        {isMobile && mobileOpen && (
          <div id="merchant-mobile-nav" className="px-6 pb-3 pt-2 bg-[#111] text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block py-2 transition ${
                  pathname === link.href ? "text-[#81d742] font-semibold" : "text-gray-300"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex gap-2 mt-2 items-center">
              <button
                onClick={() => handleLangChange("en")}
                className={`p-1 rounded text-xs font-bold ${locale === "en" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
                type="button"
              >EN</button>
              <button
                onClick={() => handleLangChange("tr")}
                className={`p-1 rounded text-xs font-bold ${locale === "tr" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
                type="button"
              >TR</button>
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-400 transition ml-3"
                title={t("Logout")}
                type="button"
              >
                <LogOut size={20} />
              </button>
            </div>
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
