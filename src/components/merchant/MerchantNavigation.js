import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";  // Mobil/desktop ayrımı için

export default function MerchantNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/");
  };

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const links = [
    { href: "/merchant/dashboard", label: t("Manage Products") },
    { href: "/merchant/merchant_payments", label: t("Payments") },
    { href: "/merchant/merchant_info", label: t("How to Integrate") },
    { href: "/merchant/merchant_support", label: t("Support") },
    { href: "/merchant/merchant_settings", label: t("Settings") },
  ];

  return (
    <header className="w-full bg-[#111] border-b border-[#1f1f1f] shadow-sm">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#d1ffd0] select-none">
          Cabo
        </h1>
        {/* Sadece mobilde hamburger, bilgisayarda klasik nav */}
        {isMobile ? (
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-white"
            title="Menu"
          >
            <Menu size={24} />
          </button>
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
              onClick={handleLogout}
              className="text-red-500 hover:text-red-400 transition ml-3"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </nav>
        )}
      </div>
      {/* Mobil Menu */}
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
          <button
            onClick={handleLogout}
            className="block py-2 text-red-500 hover:text-red-400 transition"
          >
            {t("Logout")}
          </button>
        </div>
      )}
    </header>
  );
}
