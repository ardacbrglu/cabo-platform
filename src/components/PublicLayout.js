"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";

const translations = {
  en: {
    home: "Home",
    faq: "FAQ",
    login: "Login",
    register: "Register",
    merchantQ: "Are you a product owner?",
    merchantAccess: "Merchant access",
    copyright: "Cabo Affiliate | Built by Arda Cabaroğlu",
  },
  tr: {
    home: "Anasayfa",
    faq: "Sık Sorulanlar",
    login: "Giriş Yap",
    register: "Kayıt Ol",
    merchantQ: "Ürün sahibi misin?",
    merchantAccess: "Satıcı girişi",
    copyright: "Cabo Affiliate | Arda Cabaroğlu tarafından geliştirilmiştir",
  },
};

export default function PublicLayout({ children }) {
  const pathname = usePathname();
  const { locale, setLocale, ready } = useLocale();

  const [mobileMenu, setMobileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Client-only ölçüm; ilk render sabit (false) → hydration-safe
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!ready) return null;

  const t = (k) => (translations[locale] || translations.en)[k] || k;
  const LANG_LABEL = locale === "tr" ? "TR" : "EN";

  const navLinks = [
    { href: "/", label: t("home") },
    { href: "/faq", label: t("faq") },
    { href: "/login", label: t("login") },
    { href: "/register", label: t("register") },
  ];

  const linkClass = (href) =>
    `transition hover:text-[#81d742] hover:scale-[1.015] inline-block ${
      pathname === href ? "text-[#81d742] font-semibold" : "text-gray-200"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b0b] text-white font-sans tracking-tight">
      {/* NAV */}
      <header className="flex justify-between items-center px-4 sm:px-8 md:px-10 py-4 sm:py-6 bg-[#111] shadow-sm relative">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{ color: "#d1ffd0", letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(129,215,66,0.08)" }}
        >
          Cabo
        </h1>

        {/* Desktop nav */}
        {!isMobile && (
          <nav aria-label="Public navigation">
            <ul className="flex gap-7 text-sm font-medium items-center">
              {navLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass(item.href)}>
                    {item.label}
                  </Link>
                </li>
              ))}
              {/* Locale switcher */}
              <li className="relative">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="ml-2 px-2 py-1 rounded text-[#81d742] font-bold transition hover:text-[#b0f7a2]"
                    aria-label="Change language"
                    onClick={() => setLocale(locale === "tr" ? "en" : "tr")}
                  >
                    {LANG_LABEL}
                  </button>
                </div>
              </li>
            </ul>
          </nav>
        )}

        {/* Mobile trigger */}
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
              <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.93)" }}>
                <div className="flex items-center justify-between bg-[#111] px-4 sm:px-8 md:px-10 py-4 border-b border-[#232323]">
                  <h1 className="text-3xl font-extrabold" style={{ color: "#d1ffd0" }}>
                    Cabo
                  </h1>
                  <button
                    className="text-3xl text-gray-300 px-2 py-1"
                    onClick={() => setMobileMenu(false)}
                    aria-label="Close menu"
                  >
                    ×
                  </button>
                </div>

                <ul className="flex flex-col gap-6 text-lg font-bold px-4 sm:px-8 md:px-10 pt-10">
                  {navLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenu(false)}
                        className={`block py-2 ${pathname === item.href ? "text-[#81d742]" : "text-gray-100"} hover:text-[#81d742]`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <button
                      className="w-full px-2 py-2 rounded bg-[#222] text-[#81d742] mt-3"
                      onClick={() => setLocale(locale === "tr" ? "en" : "tr")}
                    >
                      {LANG_LABEL}
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </>
        )}
      </header>

      {/* CONTENT */}
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

      {/* Merchant CTA */}
      <div className="w-full text-center py-2 bg-[#111] border-t border-[#232323] text-sm sm:text-base">
        <span className="text-gray-400">{t("merchantQ")}</span>
        <Link
          href="/merchant"
          className="ml-2 text-[#81d742] hover:underline hover:text-[#b3ffb3] font-semibold transition"
        >
          {t("merchantAccess")}
        </Link>
      </div>

      {/* FOOTER */}
      <footer className="text-center py-3 sm:py-5 bg-[#111] text-gray-500 text-xs border-t border-[#1f1f1f]">
        &copy; 2025 {t("copyright")}
      </footer>
    </div>
  );
}
