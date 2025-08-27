"use client";

/**
 * File: src/components/PublicLayout.jsx
 * Purpose: Public (unauthenticated) pages layout — desktop mevcut stil, mobile MerchantLayout ile 1e1
 *
 * UX/Security Docblock:
 * - Desktop header/nav: ESKİ HALİ KORUNDU.
 * - Mobile header/nav: MerchantLayout’taki davranış ile 1e1 (hamburger → başlık altına açılan liste).
 * - Aktif rota vurgusu: currentPath === href → yeşil & kalın.
 * - Rota değişiminde mobil menü otomatik kapanır.
 * - Erişilebilirlik: aria-label, aria-expanded; focus ring’ler korunur.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { Menu } from "lucide-react";

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
  const { locale, setLocale, ready } = useLocale();
  const [isMobile, setIsMobile] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [mobileOpen, setMobileOpen] = useState(false);

  // client-only ölçümler
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    setCurrentPath(window.location?.pathname || "/");
    return () => window.removeEventListener("resize", check);
  }, []);

  // rota değişince menüyü kapat (MerchantLayout davranışıyla uyumlu)
  useEffect(() => {
    const onLocChange = () => {
      try {
        setCurrentPath(window.location.pathname || "/");
        setMobileOpen(false);
      } catch {}
    };
    const patch = (type) => {
      const orig = history[type];
      return function (...args) {
        const ret = orig.apply(this, args);
        try { window.dispatchEvent(new Event("locationchange")); } catch {}
        return ret;
      };
    };
    try {
      history.pushState = patch("pushState");
      history.replaceState = patch("replaceState");
    } catch {}
    window.addEventListener("popstate", onLocChange);
    window.addEventListener("locationchange", onLocChange);
    return () => {
      window.removeEventListener("popstate", onLocChange);
      window.removeEventListener("locationchange", onLocChange);
    };
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

  const linkClassDesktop = (href) =>
    `transition hover:text-[#81d742] hover:scale-[1.015] inline-block ${
      currentPath === href ? "text-[#81d742] font-semibold" : "text-gray-200"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b0b] text-white font-sans tracking-tight">
      {/* HEADER */}
      <header className="flex justify-between items-center px-4 sm:px-8 md:px-10 py-4 sm:py-6 bg-[#111] shadow-sm relative">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{ color: "#d1ffd0", letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(129,215,66,0.08)" }}
        >
          Cabo
        </h1>

        {/* DESKTOP — eski hali birebir korunur */}
        {!isMobile ? (
          <nav aria-label="Public navigation">
            <ul className="flex gap-7 text-sm font-medium items-center">
              {navLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClassDesktop(item.href)} prefetch={false}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="ml-2">
                <button
                  type="button"
                  className="px-2 py-1 rounded text-[#81d742] font-bold transition hover:text-[#b0f7a2]"
                  aria-label="Change language"
                  onClick={() => setLocale(locale === "tr" ? "en" : "tr")}
                >
                  {LANG_LABEL}
                </button>
              </li>
            </ul>
          </nav>
        ) : (
          // MOBILE — MerchantLayout ile 1e1 (hamburger + başlık altına açılan liste)
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
        )}
      </header>

      {/* MOBILE DROPDOWN (MerchantLayout tarzı) */}
      {isMobile && mobileOpen && (
        <div className="px-6 pb-3 pt-2 bg-[#111] text-sm">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              prefetch={false}
              onClick={() => setMobileOpen(false)}
              className={`block py-2 transition ${
                currentPath === l.href ? "text-[#81d742] font-semibold" : "text-gray-300"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}

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

      {/* Merchant CTA (ince çizgi) — eski hali korunur */}
      <div className="relative w-full text-center py-3 bg-[#111] text-sm sm:text-base">
        <span className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[#1b1b1b] to-transparent" />
        <span className="text-gray-400">{t("merchantQ")}</span>
        <Link
          href="/merchant/login"
          className="ml-2 text-[#81d742] hover:underline hover:text-[#b3ffb3] font-semibold transition"
          prefetch={false}
          aria-label={t("merchantAccess")}
        >
          {t("merchantAccess")}
        </Link>
      </div>

      {/* FOOTER — eski hali korunur */}
      <footer className="text-center py-4 sm:py-5 bg-[#111] text-gray-500 text-xs">
        &copy; 2025 {t("copyright")}
      </footer>
    </div>
  );
}
