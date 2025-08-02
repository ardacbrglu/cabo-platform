"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";  // Mobil/desktop ayrımı için

export default function MerchantNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslation();
  const isMobile = useIsMobile();

  // Dil seçimi (localStorage ile)
  const [locale, setLocale] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("locale") || "en" : "en"
  );
  const handleLangChange = (lng) => {
    setLocale(lng);
    if (typeof window !== "undefined") localStorage.setItem("locale", lng);
    window.location.reload(); // veya context/hook ile değiştiriyorsan kaldır
  };

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const links = [
    { href: "/merchant/dashboard", label: t("Manage Products") },
    { href: "/merchant/merchant_payments", label: t("Payments") },
    { href: "/merchant/merchant_info", label: t("How to Integrate") },
    { href: "/merchant/merchant_support", label: t("Support") },
    { href: "/merchant/merchant_settings", label: t("Settings") },
  ];

  const handleLogout = () => {
    document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/");
  };

  return (
    <header className="w-full bg-[#111] border-b border-[#1f1f1f] shadow-sm">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#d1ffd0] select-none">
          Cabo
        </h1>
        {/* Mobilde hamburger, masaüstünde klasik menü */}
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
          <nav className="flex gap-6 items-center text-sm font-medium">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition hover:text-[#81d742] hover:scale-[1.02] ${
                  pathname === link.href
                    ? "text-[#81d742] font-semibold"
                    : "text-gray-300"
                }`}
              >
                {link.label}
              </Link>
            ))}
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
              <LogOut size={18} />
            </button>
          </nav>
        )}
      </div>
      {/* Mobil Açılır Menü */}
      {isMobile && mobileOpen && (
        <div className="px-5 pb-3 pt-2 bg-[#111] text-sm border-t border-[#1f1f1f]">
          {links.map(link => (
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
            >
              {t("Logout")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
