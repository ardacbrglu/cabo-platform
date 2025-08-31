"use client";

/**
 * File: src/components/PublicLayout.jsx
 * Purpose: Public (unauthenticated) pages layout — desktop mevcut stil, mobile MerchantLayout ile 1e1
 *
 * UX/Security Docblock:
 * - Desktop header/nav: ESKİ HALİ KORUNDU; dil değişimi butonu artık açılır çekmece (dropdown).
 * - Mobile header/nav: MerchantLayout’taki davranış ile 1e1 (hamburger → başlık altına açılan liste), dil seçimi eklendi.
 * - Aktif rota vurgusu: currentPath === href → yeşil & kalın.
 * - Rota değişiminde mobil menü otomatik kapanır.
 * - Erişilebilirlik: aria-label, aria-expanded, aria-haspopup; ESC ile kapanma; dışa tıklayınca kapanma.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { Menu, Globe, ChevronDown } from "lucide-react";

const translations = {
  en: {
    home: "Home",
    faq: "FAQ",
    login: "Login",
    register: "Register",
    merchantQ: "Are you a product owner?",
    merchantAccess: "Merchant access",
    copyright: "Cabo Affiliate | Built by Arda Cabaroğlu",
    language: "Language",
  },
  tr: {
    home: "Anasayfa",
    faq: "Sık Sorulanlar",
    login: "Giriş Yap",
    register: "Kayıt Ol",
    merchantQ: "Ürün sahibi misin?",
    merchantAccess: "Satıcı girişi",
    copyright: "Cabo Affiliate | Arda Cabaroğlu tarafından geliştirilmiştir",
    language: "Dil",
  },
};

const LANGS = [
  { code: "tr", short: "TR", label: "Türkçe" },
  { code: "en", short: "EN", label: "English" },
];

export default function PublicLayout({ children }) {
  const { locale, setLocale, ready } = useLocale();
  const [isMobile, setIsMobile] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Desktop dil dropdown durumu
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

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
        setLangOpen(false);
      } catch {}
    };
    const patch = (type) => {
      const orig = history[type];
      return function (...args) {
        const ret = orig.apply(this, args);
        try {
          window.dispatchEvent(new Event("locationchange"));
        } catch {}
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

  // Desktop dil menüsü: dışa tıklayınca ve ESC ile kapat
  useEffect(() => {
    const onDocClick = (e) => {
      if (!langRef.current) return;
      if (!langRef.current.contains(e.target)) setLangOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setLangOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!ready) return null;

  const t = (k) => (translations[locale] || translations.en)[k] || k;
  const LANG_LABEL = (LANGS.find((l) => l.code === locale) || LANGS[1]).short; // default EN

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

  const LangOption = ({ code, label, short }) => {
    const active = locale === code;
    return (
      <button
        type="button"
        onClick={() => {
          setLocale(code);
          setLangOpen(false);
        }}
        className={`w-full text-left px-3 py-2 rounded-md transition ${
          active ? "bg-[#1a1a1a] text-[#81d742] font-semibold" : "text-gray-200 hover:bg-[#1a1a1a]"
        }`}
        role="menuitem"
        aria-current={active ? "true" : "false"}
      >
        <span className="mr-2 inline-block min-w-[2.2rem] text-center font-bold">{short}</span>
        <span>{label}</span>
      </button>
    );
  };

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

        {/* DESKTOP — eski hali, dil için dropdown eklendi */}
        {!isMobile ? (
          <nav aria-label="Public navigation" className="relative">
            <ul className="flex gap-7 text-sm font-medium items-center">
              {navLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={linkClassDesktop(item.href)}
                    prefetch={false}
                    aria-current={currentPath === item.href ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}

              {/* Dil Değiştirici (Dropdown) */}
              <li className="ml-2 relative" ref={langRef}>
                <button
                  type="button"
                  className="px-2 py-1 rounded text-[#81d742] font-bold transition hover:text-[#b0f7a2] flex items-center gap-1"
                  aria-label="Change language"
                  aria-haspopup="menu"
                  aria-expanded={langOpen}
                  onClick={() => setLangOpen((s) => !s)}
                >
                  <Globe size={16} aria-hidden="true" />
                  {LANG_LABEL}
                  <ChevronDown size={16} className={`transition ${langOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>

                {langOpen && (
                  <div
                    role="menu"
                    aria-label="Language selector"
                    className="absolute right-0 mt-2 w-44 rounded-lg border border-[#1e1e1e] bg-[#131313] shadow-lg p-1 z-20"
                  >
                    {LANGS.map((l) => (
                      <LangOption key={l.code} {...l} />
                    ))}
                  </div>
                )}
              </li>
            </ul>
          </nav>
        ) : (
          // MOBILE — MerchantLayout ile 1e1 (hamburger + başlık altına açılan liste)
          <div className="flex items-center">
            <button
              onClick={() => setMobileOpen((s) => !s)}
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
              aria-current={currentPath === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}

          {/* Mobil Dil Seçimi */}
          <div className="mt-2 pt-2 border-t border-[#222]">
            <div className="flex items-center gap-2 text-gray-400 mb-1">
              <Globe size={16} aria-hidden="true" />
              <span className="uppercase tracking-wide">{t("language")} / Language</span>
            </div>
            <div className="flex gap-2">
              {LANGS.map((l) => {
                const active = locale === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLocale(l.code)}
                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition border ${
                      active
                        ? "border-[#2a2a2a] bg-[#1a1a1a] text-[#81d742]"
                        : "border-[#1f1f1f] text-gray-200 hover:bg-[#161616]"
                    }`}
                    aria-current={active ? "true" : "false"}
                  >
                    {l.short}
                  </button>
                );
              })}
            </div>
          </div>
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
