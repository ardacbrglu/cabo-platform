"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LogOut, Menu } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile"; // Mobil tespiti

const NAV_LINKS = [
  { href: "/merchant/dashboard", label: "Manage Products" },
  { href: "/merchant/merchant_payments", label: "Payments" },
  { href: "/merchant/merchant_info", label: "How to Integrate" },
  { href: "/merchant/merchant_support", label: "Support" },
  { href: "/merchant/merchant_settings", label: "Settings" },
];

export default function MerchantLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslation();
  const isMobile = useIsMobile();

  // Dil seçimi (localStorage ile)
  const [locale, setLocale] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("locale") || "en" : "en"
  );
  const handleLangChange = (lng) => {
    setLocale(lng);
    if (typeof window !== "undefined") localStorage.setItem("locale", lng);
    window.location.reload(); // hook/context ile dinamik değiştiriyorsan kaldır
  };

  // Hamburger menu (mobil)
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Güvenli logout
  const handleLogout = () => {
    document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/");
  };

  // Menü linklerini locale ile çevir
  const links = [
    { href: "/merchant/dashboard", label: t("Manage Products") },
    { href: "/merchant/merchant_payments", label: t("Payments") },
    { href: "/merchant/merchant_info", label: t("How to Integrate") },
    { href: "/merchant/merchant_support", label: t("Support") },
    { href: "/merchant/merchant_settings", label: t("Settings") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white font-sans tracking-tight">
      {/* NAVBAR */}
      <header className="w-full bg-[#111]  shadow-sm">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
          {/* LOGO */}
          <h1 className="text-3xl font-extrabold tracking-tight text-[#d1ffd0] select-none">
            Cabo
          </h1>
          {/* MENÜ */}
          {isMobile ? (
            <>
              <div className="flex gap-1 items-center">
                {/* Dil seçici mobilde */}
                <button
                  onClick={() => handleLangChange("en")}
                  className={`p-1 rounded text-xs font-bold ${locale === "en" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
                  title="English"
                >
                  EN
                </button>
                <button
                  onClick={() => handleLangChange("tr")}
                  className={`p-1 rounded text-xs font-bold ${locale === "tr" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
                  title="Türkçe"
                >
                  TR
                </button>
                {/* Hamburger */}
                <button
                  onClick={() => setMobileOpen(!mobileOpen)}
                  className="text-white ml-1"
                  title="Menu"
                >
                  <Menu size={24} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 md:gap-8">
              <nav className="flex gap-2 md:gap-8 items-center text-sm font-medium">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`transition hover:text-[#81d742] hover:scale-[1.015] ${
                      pathname === link.href
                        ? "text-[#81d742] font-semibold"
                        : "text-gray-200"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              {/* Dil seçici desktopta */}
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => handleLangChange("en")}
                  className={`p-1 rounded ${locale === "en" ? "bg-[#81d742] text-[#101010] font-bold" : "text-gray-300"}`}
                  title="English"
                >
                  EN
                </button>
                <button
                  onClick={() => handleLangChange("tr")}
                  className={`p-1 rounded ${locale === "tr" ? "bg-[#81d742] text-[#101010] font-bold" : "text-gray-300"}`}
                  title="Türkçe"
                >
                  TR
                </button>
              </div>
              {/* Logout */}
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-400 transition ml-3"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
        {/* Mobil Açılır Menü */}
        {isMobile && mobileOpen && (
          <div className="px-5 pb-3 pt-2 ">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block py-2 transition ${
                  pathname === link.href
                    ? "text-[#81d742] font-semibold"
                    : "text-gray-300"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleLangChange("en")}
                className={`p-1 rounded text-xs font-bold ${locale === "en" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
              >
                EN
              </button>
              <button
                onClick={() => handleLangChange("tr")}
                className={`p-1 rounded text-xs font-bold ${locale === "tr" ? "bg-[#81d742] text-[#101010]" : "text-gray-300"}`}
              >
                TR
              </button>
              <button
                onClick={handleLogout}
                className="text-red-500 hover:text-red-400 transition ml-3"
                title={t("Logout")}
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        )}
      </header>
      {/* GOVDE */}
      <main className="max-w-5xl w-full mx-auto mt-8 px-2 pb-24 flex-grow flex flex-col">
        {children}
      </main>
      <footer className="text-center py-5 bg-[#111] text-gray-500 text-xs border-t border-[#1f1f1f] mt-auto">
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
