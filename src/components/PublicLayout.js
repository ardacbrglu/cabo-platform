"use client";

/**
 * PublicLayout (Unauthenticated pages)
 * UX/Security Docblock:
 * - Mobile hamburger: top-sheet panel + overlay; outside click & ESC ile kapanır.
 * - Active link vurgusu: currentPath === href.
 * - Dil anahtarı: locale toggle butonu hem desktop hem mobile menü içinde.
 * - Erişilebilirlik: aria-controls, aria-expanded, role="dialog", aria-modal.
 * - UI/stil korunur; mevcut renkler ve tipografi bozulmaz.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { Menu, X } from "lucide-react";

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

  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // client-only ölçümler
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    setCurrentPath(window.location?.pathname || "/");
    return () => window.removeEventListener("resize", check);
  }, []);

  // rota değişince menüyü kapat
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

  // dışarı tıklama & ESC ile kapatma
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClick = (e) => {
      const panel = panelRef.current;
      const btn = buttonRef.current;
      if (!panel) return;
      const isInsidePanel = panel.contains(e.target);
      const isButton = btn && btn.contains(e.target);
      if (!isInsidePanel && !isButton) setMobileOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [mobileOpen]);

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
      currentPath === href ? "text-[#81d742] font-semibold" : "text-gray-200"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b0b] text-white font-sans tracking-tight">
      {/* NAV */}
      <header className="flex justify-between items-center px-4 sm:px-8 md:px-10 py-4 sm:py-6 bg-[#111] shadow-sm relative z-30">
        <h1
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{ color: "#d1ffd0", letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(129,215,66,0.08)" }}
        >
          Cabo
        </h1>

        {!isMobile ? (
          <nav aria-label="Public navigation">
            <ul className="flex gap-7 text-sm font-medium items-center">
              {navLinks.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass(item.href)} prefetch={false}>
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
          <button
            ref={buttonRef}
            type="button"
            className="block md:hidden text-[#81d742] p-2 rounded focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            aria-label="Open menu"
            aria-controls="public-mobile-panel"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
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

      {/* Merchant CTA (ince çizgi) */}
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

      {/* FOOTER */}
      <footer className="text-center py-4 sm:py-5 bg-[#111] text-gray-500 text-xs">
        &copy; 2025 {t("copyright")}
      </footer>

      {/* MOBILE OVERLAY + PANEL (sadece mobile iken render edilir) */}
      {isMobile && (
        <>
          {/* Overlay */}
          <div
            className={`fixed inset-0 z-40 transition-all duration-200 ${
              mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            } bg-black/60`}
            aria-hidden={!mobileOpen}
          />
          {/* Top Sheet Panel */}
          <div
            id="public-mobile-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className={`fixed top-0 left-0 right-0 z-50 rounded-b-2xl bg-[#191919] border-b border-[#232323] shadow-2xl transition-transform duration-300 ease-out ${
              mobileOpen ? "translate-y-0" : "-translate-y-full"
            }`}
            style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2 min-h-[56px] border-b border-[#232323]">
              <span className="flex items-center gap-2 font-mono font-black text-[1.12rem] select-none tracking-widest text-[#d1ffd0]">
                <span className="bg-[#81d742] rounded-lg px-2 py-0.5 text-[#111] text-lg font-black shadow-md">C</span>
                Cabo
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-gray-300 hover:text-[#81d742] transition p-1.5"
                aria-label="Close menu"
              >
                <X size={26} />
              </button>
            </div>

            <nav className="flex flex-col gap-1 px-5 pt-2 pb-3" aria-label="Primary">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 py-2 px-2 rounded-lg font-medium text-[1.02rem] transition-all ${
                    currentPath === href
                      ? "bg-[#212921] text-[#81d742] font-semibold"
                      : "text-white hover:text-[#81d742] hover:bg-[#1a1f1a]"
                  }`}
                >
                  {label}
                </Link>
              ))}

              <div className="mt-2 pt-2 border-t border-[#232323] flex items-center justify-between">
                <span className="text-sm text-gray-400">Language</span>
                <button
                  type="button"
                  className="px-2 py-1 rounded text-[#81d742] font-bold transition hover:text-[#b0f7a2]"
                  aria-label="Change language"
                  onClick={() => setLocale(locale === "tr" ? "en" : "tr")}
                >
                  {LANG_LABEL}
                </button>
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
