"use client";

/**
 * File: src/components/PublicLayout.jsx
 * Purpose: Public (unauthenticated) pages layout — desktop mevcut stil, mobile MerchantLayout ile 1e1
 *
 * UX/Security Docblock (Cabo PROD):
 * - Desktop nav korunur; dil değiştirici açılır çekmece (dropdown) olarak sunulur.
 * - Dropdown içerikleri yalın: yalnızca bayrak + "TR"/"EN" (uzun ad yok).
 * - Dil butonu, diğer nav item’larıyla aynı renkte (hover’da yeşil).
 * - Mobile menüde “Dil / Language” satırı var; tıklayınca bayraklı TR/EN seçenekleri açılır.
 * - Dil seçimi persistLocale ile cookie (+login ise DB) olarak saklanır; sayfa yenilemelerinde korunur.
 * - Aktif rota vurgusu: currentPath === href → yeşil & kalın.
 * - Rota değişiminde tüm açılır menüler kapanır.
 * - Erişilebilirlik: aria-label/expanded/haspopup; ESC ve dış tıklamada kapanma.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { Menu, Globe, ChevronDown, ChevronRight } from "lucide-react";

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
  { code: "tr", short: "TR", flag: "🇹🇷" },
  { code: "en", short: "EN", flag: "🇺🇸" },
];

export default function PublicLayout({ children }) {
  const { locale, setLocale, persistLocale, ready } = useLocale();
  const [isMobile, setIsMobile] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);

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
        setMobileLangOpen(false);
        setLangOpen(false);
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
        setMobileLangOpen(false);
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
  const activeLang = LANGS.find((l) => l.code === (locale?.toLowerCase().startsWith("tr") ? "tr" : "en")) || LANGS[1];

  const setLangPersist = (code) => {
    // persistLocale varsa onu kullan, yoksa setLocale ile devam
    if (typeof persistLocale === "function") persistLocale(code);
    else if (typeof setLocale === "function") setLocale(code);
  };

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

  const LangOption = ({ code, short, flag }) => {
    const active = activeLang.code === code;
    return (
      <button
        type="button"
        onClick={() => {
          setLangPersist(code);
          setLangOpen(false);
          setMobileLangOpen(false);
        }}
        className={`w-full text-left px-3 py-2 rounded-md transition flex items-center gap-2 ${
          active ? "bg-[#1a1a1a] text-[#81d742] font-semibold" : "text-gray-200 hover:bg-[#1a1a1a]"
        }`}
        role="menuitem"
        aria-current={active ? "true" : "false"}
      >
        <span aria-hidden="true" className="text-base leading-none">{flag}</span>
        <span className="tracking-wide">{short}</span>
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

        {/* DESKTOP — dil için dropdown eklendi; buton rengi nav ile aynı */}
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
                  className={`px-2 py-1 rounded transition flex items-center gap-1 ${
                    // diğer nav item renkleriyle aynı
                    "text-gray-200 hover:text-[#b0f7a2]"
                  }`}
                  aria-label="Change language"
                  aria-haspopup="menu"
                  aria-expanded={langOpen}
                  onClick={() => setLangOpen((s) => !s)}
                >
                  <span aria-hidden="true"><Globe size={16} /></span>
                  <span className="font-bold">{activeLang.short}</span>
                  <ChevronDown size={16} className={`transition ${langOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>

                {langOpen && (
                  <div
                    role="menu"
                    aria-label="Language selector"
                    className="absolute right-0 mt-2 w-36 rounded-lg border border-[#1e1e1e] bg-[#131313] shadow-lg p-1 z-20"
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
          // MOBILE — hamburger
          <div className="flex items-center">
            <button
              onClick={() => {
                setMobileOpen((s) => !s);
                if (mobileLangOpen) setMobileLangOpen(false);
              }}
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

      {/* MOBILE DROPDOWN (MerchantLayout tarzı + dil seçimi) */}
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

          {/* Mobil Dil Satırı */}
          <button
            type="button"
            className="w-full mt-1 py-2 flex items-center justify-between text-gray-300 hover:text-white transition"
            onClick={() => setMobileLangOpen((s) => !s)}
            aria-haspopup="menu"
            aria-expanded={mobileLangOpen}
            aria-label={t("language")}
          >
            <span className="flex items-center gap-2">
              <Globe size={16} aria-hidden="true" />
              <span className="uppercase tracking-wide">{t("language")}</span>
              <span className="ml-1 text-xs text-gray-400">({activeLang.short})</span>
            </span>
            <ChevronRight
              size={16}
              className={`transition ${mobileLangOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>

          {mobileLangOpen && (
            <div
              role="menu"
              aria-label="Language selector"
              className="mt-1 p-1 rounded-md border border-[#222] bg-[#101010]"
            >
              {LANGS.map((l) => (
                <LangOption key={l.code} {...l} />
              ))}
            </div>
          )}
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
