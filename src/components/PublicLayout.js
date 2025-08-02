'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocale } from '@/context/LocaleContext'; // <-- Context'ten oku!

// --- Nav translations (artık context üzerinden locale alınacak) ---
const translations = {
  en: {
    home: "Home",
    faq: "FAQ",
    login: "Login",
    register: "Register",
    merchantQ: "Are you a product owner?",
    merchantAccess: "Merchant access",
    copyright: "Cabo Affiliate | Built by Arda Cabaroğlu"
  },
  tr: {
    home: "Anasayfa",
    faq: "Sık Sorulanlar",
    login: "Giriş Yap",
    register: "Kayıt Ol",
    merchantQ: "Ürün sahibi misin?",
    merchantAccess: "Satıcı girişi",
    copyright: "Cabo Affiliate | Arda Cabaroğlu tarafından geliştirilmiştir"
  }
};

export default function PublicLayout({ children }) {
  const pathname = usePathname();
  const { locale, setLocale, ready } = useLocale();
  const [showLocale, setShowLocale] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // --- Responsive kontrolü ---
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!ready) return null; // Dil context hazır olmadan render etme

  const t = (key) => translations[locale][key] || key;
  const LANG_LABEL = locale === "tr" ? "TR" : "EN";

  const navLinks = [
    { href: '/', label: t("home") },
    { href: '/faq', label: t("faq") },
    { href: '/login', label: t("login") },
    { href: '/register', label: t("register") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b0b] text-white font-sans tracking-tight">
      {/* === NAVIGATION === */}
      <header className="flex justify-between items-center px-4 sm:px-8 md:px-10 py-4 sm:py-6 bg-[#111] shadow-sm relative">
        {/* Logo */}
        <h1
          className={`text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight select-none transition-all duration-200
            ${isMobile && mobileMenu ? 'opacity-0 pointer-events-none' : ''}
          `}
          style={{
            color: "#d1ffd0",
            letterSpacing: "-0.02em",
            textShadow: "0 2px 12px rgba(129,215,66,0.08)"
          }}
        >
          Cabo
        </h1>
        {/* DESKTOP NAV */}
        {!isMobile && (
          <nav>
            <ul className="flex gap-7 text-sm font-medium items-center">
              {navLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`transition hover:text-[#81d742] hover:scale-[1.015] inline-block ${pathname === item.href ? 'text-[#81d742] font-semibold' : 'text-gray-200'}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="relative">
                <button
                  className={`ml-2 px-2 py-1 rounded text-[#81d742] font-bold transition focus:outline-none focus:ring-0 hover:text-[#b0f7a2]`}
                  aria-label="Dil değiştir"
                  onClick={() => setShowLocale(l => !l)}
                  style={{ border: "none", background: "none", boxShadow: "none" }}
                >
                  {LANG_LABEL}
                </button>
                {showLocale && (
                  <div className="absolute right-3 mt-2 bg-[#181818] border border-[#232323] rounded shadow-lg z-50 w-28 text-center">
                    <button className={`w-full px-4 py-2 text-sm hover:bg-[#232323] ${locale === "en" ? "text-[#81d742] font-bold" : "text-white"}`}
                      onClick={() => { setLocale("en"); setShowLocale(false); }}>
                      <span className="font-mono mr-1">EN</span>
                    </button>
                    <button className={`w-full px-4 py-2 text-sm hover:bg-[#232323] ${locale === "tr" ? "text-[#81d742] font-bold" : "text-white"}`}
                      onClick={() => { setLocale("tr"); setShowLocale(false); }}>
                      <span className="font-mono mr-1">TR</span>
                    </button>
                  </div>
                )}
              </li>
            </ul>
          </nav>
        )}
        {/* MOBILE NAV */}
        {isMobile && (
          <>
            <button
              className="block md:hidden text-[#81d742] text-3xl px-3 py-1 rounded focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              onClick={() => setMobileMenu(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            {mobileMenu && (
              <div
                className="fixed inset-0 z-50 flex flex-col"
                style={{ background: "rgba(0,0,0,0.93)" }}
              >
                {/* Paneldeki logo ve kapama */}
                <div className="flex items-center justify-between bg-[#111] px-4 sm:px-8 md:px-10 py-4 border-b border-[#232323]">
                  <h1 className="text-3xl font-extrabold" style={{ color: "#d1ffd0" }}>Cabo</h1>
                  <button
                    className="text-3xl text-gray-300 px-2 py-1"
                    onClick={() => setMobileMenu(false)}
                    aria-label="Menüyü Kapat"
                  >×</button>
                </div>
                <ul className="flex flex-col gap-6 text-lg font-bold px-4 sm:px-8 md:px-10 pt-10">
                  {navLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenu(false)}
                        className={`block py-2 ${pathname === item.href ? 'text-[#81d742]' : 'text-gray-100'} hover:text-[#81d742]`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <button
                      className="w-full px-2 py-2 rounded bg-[#222] text-[#81d742] mt-3"
                      onClick={() => setShowLocale(l => !l)}
                    >
                      {LANG_LABEL}
                    </button>
                    {showLocale && (
                      <div className="absolute right-10 mt-2 bg-[#181818] border border-[#232323] rounded shadow-lg z-50 w-28 text-center">
                        <button className={`w-full px-4 py-2 text-sm hover:bg-[#232323] ${locale === "en" ? "text-[#81d742] font-bold" : "text-white"}`}
                          onClick={() => { setLocale("en"); setShowLocale(false); }}>
                          <span className="font-mono mr-1">EN</span>
                        </button>
                        <button className={`w-full px-4 py-2 text-sm hover:bg-[#232323] ${locale === "tr" ? "text-[#81d742] font-bold" : "text-white"}`}
                          onClick={() => { setLocale("tr"); setShowLocale(false); }}>
                          <span className="font-mono mr-1">TR</span>
                        </button>
                      </div>
                    )}
                  </li>
                </ul>
              </div>
            )}
          </>
        )}
      </header>

      {/* === ANA İÇERİK === */}
      <main
        className="flex-1 flex flex-col items-center"
        style={{
          minHeight: isMobile ? "calc(68vh)" : "calc(75vh)",
          justifyContent: "center",
          paddingBottom: isMobile ? 10 : 32,
          paddingTop: isMobile ? 24 : 32,
        }}
      >
        {children}
      </main>

      {/* === MERCHANT CTA === */}
      <div className="w-full text-center py-2 bg-[#111] border-t border-[#232323] text-sm sm:text-base">
        <span className="text-gray-400">
          {t("merchantQ")}
        </span>
        <Link
          href="/merchant"
          className="ml-2 text-[#81d742] hover:underline hover:text-[#b3ffb3] font-semibold transition"
        >
          {t("merchantAccess")}
        </Link>
      </div>

      {/* === FOOTER === */}
      <footer className="text-center py-3 sm:py-5 bg-[#111] text-gray-500 text-xs border-t border-[#1f1f1f]">
        &copy; 2025 {t("copyright")}
      </footer>
    </div>
  );
}
