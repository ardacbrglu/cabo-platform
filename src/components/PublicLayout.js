"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { Menu, Globe, ChevronDown, ChevronRight } from "lucide-react";

/**
 * Security Docblock (PublicLayout)
 * - Client-only; no dynamic HTML injection
 * - Active link from location.pathname only
 * - Fixed header/footer heights; no layout shift
 * - No third-party inline scripts
 */

const translations = {
  en: { home: "Home", faq: "FAQ", login: "Login", register: "Register", merchantQ: "Are you a product owner?", merchantAccess: "Merchant access", copyright: "Cabo Affiliate | Built by Arda Cabaroğlu", language: "Language" },
  tr: { home: "Anasayfa", faq: "Sık Sorulanlar", login: "Giriş Yap", register: "Kayıt Ol", merchantQ: "Ürün sahibi misin?", merchantAccess: "Satıcı girişi", copyright: "Cabo Affiliate | Arda Cabaroğlu tarafından geliştirilmiştir", language: "Dil" },
};

const LANGS = [{ code: "tr", short: "TR" }, { code: "en", short: "EN" }];

function FlagTR({ className = "w-4 h-3" }) {
  return (
    <svg viewBox="0 0 18 12" className={`${className} rounded-[2px]`} aria-hidden="true">
      <rect width="18" height="12" fill="#E30A17" />
      <circle cx="7.2" cy="6" r="3.05" fill="#fff" />
      <circle cx="8.1" cy="6" r="2.45" fill="#E30A17" />
      <polygon fill="#fff" points="10.5,6 11.25,6.22 11.05,5.49 11.6,5 10.84,4.93 10.5,4.25 10.16,4.93 9.4,5 9.95,5.49 9.75,6.22" />
    </svg>
  );
}
function FlagUS({ className = "w-4 h-3" }) {
  return (
    <svg viewBox="0 0 19 12" className={`${className} rounded-[2px]`} aria-hidden="true">
      <rect width="19" height="12" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map((y) => <rect key={y} x="0" y={y} width="19" height="1" fill="#fff" />)}
      <rect x="0" y="0" width="8" height="7" fill="#3C3B6E" />
      {[1.2, 3.6, 2.4, 4.8].map((x, i) => <circle key={i} cx={x * 1.5} cy={2 + i} r="0.25" fill="#fff" />)}
    </svg>
  );
}
const Flag = ({ code, className }) => (code === "tr" ? <FlagTR className={className} /> : <FlagUS className={className} />);

export default function PublicLayout({ children }) {
  const { locale, setLocale, persistLocale, ready } = useLocale();
  const [isMobile, setIsMobile] = useState(false);
  const [currentPath, setCurrentPath] = useState("/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    setCurrentPath(window.location?.pathname || "/");
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const onLocChange = () => { try { setCurrentPath(window.location.pathname || "/"); } catch {} };
    const patch = (type) => {
      const orig = history[type];
      return function (...args) {
        const ret = orig.apply(this, args);
        try { window.dispatchEvent(new Event("locationchange")); } catch {}
        return ret;
      };
    };
    try { history.pushState = patch("pushState"); history.replaceState = patch("replaceState"); } catch {}
    window.addEventListener("popstate", onLocChange);
    window.addEventListener("locationchange", onLocChange);
    return () => {
      window.removeEventListener("popstate", onLocChange);
      window.removeEventListener("locationchange", onLocChange);
    };
  }, []);

  useEffect(() => {
    const onDocClick = (e) => { if (!langRef.current) return; if (!langRef.current.contains(e.target)) setLangOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setLangOpen(false); setMobileOpen(false); setMobileLangOpen(false); } };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!ready) return null;

  const t = (k) => (translations[locale] || translations.en)[k] || k;
  const activeLangCode = (locale?.toLowerCase().startsWith("tr") ? "tr" : "en");
  const activeLang = LANGS.find((l) => l.code === activeLangCode) || LANGS[1];
  const setLangPersist = (code) => (typeof persistLocale === "function" ? persistLocale(code) : setLocale?.(code));

  const navLinks = [
    { href: "/", label: t("home") },
    { href: "/faq", label: t("faq") },
    { href: "/login", label: t("login") },
    { href: "/register", label: t("register") },
  ];

  const linkClassDesktop = (href) =>
    `transition inline-block hover:text-[#81d742] ${currentPath === href ? "text-[#81d742] font-semibold" : "text-gray-200"}`;

  return (
    <div className="public-shell">
      {/* HEADER — dashboard ile aynı hiza: sol üstte brand, px-6 lg:px-8 */}
      <header className="public-header">
        <div className="h-full w-full flex items-center justify-between px-6 lg:px-8">
          <Link href="/" prefetch={false} className="brand-cabo select-none" aria-label="Cabo homepage">
            Cabo
          </Link>

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
                <li className="ml-2 relative" ref={langRef}>
                  <button
                    type="button"
                    className="px-2 py-1 rounded transition flex items-center gap-1 text-gray-200 hover:text-[#b0f7a2]"
                    aria-label="Change language"
                    aria-haspopup="menu"
                    aria-expanded={langOpen}
                    onClick={() => setLangOpen((s) => !s)}
                    style={{ outline: "none" }}
                  >
                    <Globe size={18} />
                    <ChevronDown size={16} className={`transition ${langOpen ? "rotate-180" : ""}`} />
                  </button>
                  {langOpen && (
                    <div
                      role="menu"
                      aria-label="Language selector"
                      className="absolute right-0 mt-2 w-36 rounded-xl border border-[#242424] bg-[#0f0f0f] shadow-[0_8px_24px_rgba(0,0,0,0.45)] p-1 z-30"
                    >
                      {LANGS.map((l) => {
                        const active = activeLang.code === l.code;
                        return (
                          <button
                            key={l.code}
                            type="button"
                            onClick={() => { setLangPersist(l.code); setLangOpen(false); }}
                            className={`w-full text-left px-3 py-2 rounded-md transition flex items-center gap-2 ${
                              active ? "bg-[#141414] text-[#81d742] font-semibold" : "text-gray-200 hover:bg-[#151515]"
                            }`}
                            role="menuitem"
                            aria-current={active ? "true" : "false"}
                            style={{ outline: "none" }}
                          >
                            <Flag code={l.code} className="w-4 h-3 ring-1 ring-[#2b2b2b]" />
                            <span className="tracking-wide">{l.short}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              </ul>
            </nav>
          ) : (
            <button
              onClick={() => { setMobileOpen((s) => !s); if (mobileLangOpen) setMobileLangOpen(false); }}
              className="text-white"
              type="button"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <Menu size={24} />
            </button>
          )}
        </div>

        {/* Mobile menu */}
        {isMobile && mobileOpen && (
          <div className="border-t border-[#1b1b1b] bg-[#111]">
            <div className="px-6 lg:px-8 py-2 text-sm">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch={false}
                  className={`block py-2 transition ${currentPath === l.href ? "text-[#81d742] font-semibold" : "text-gray-300"}`}
                  aria-current={currentPath === l.href ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                className="w-full mt-1 py-2 flex items-center justify-between text-gray-300 hover:text-white transition"
                onClick={() => setMobileLangOpen((s) => !s)}
                aria-haspopup="menu"
                aria-expanded={mobileLangOpen}
                aria-label={(translations[locale] || translations.en).language}
                style={{ outline: "none" }}
              >
                <span className="flex items-center gap-2">
                  <Globe size={16} />
                  <span className="uppercase tracking-wide">{(translations[locale] || translations.en).language}</span>
                </span>
                <ChevronRight size={16} className={`transition ${mobileLangOpen ? "rotate-90" : ""}`} />
              </button>
              {mobileLangOpen && (
                <div role="menu" aria-label="Language selector" className="mt-1 p-1 rounded-md border border-[#222] bg-[#101010]">
                  {LANGS.map((l) => {
                    const active = activeLang.code === l.code;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => { setLangPersist(l.code); }}
                        className={`w-full text-left px-3 py-2 rounded-md transition flex items-center gap-2 ${
                          active ? "bg-[#1a1a1a] text-[#81d742] font-semibold" : "text-gray-200 hover:bg-[#1a1a1a]"
                        }`}
                        role="menuitem"
                        aria-current={active ? "true" : "false"}
                        style={{ outline: "none" }}
                      >
                        <Flag code={l.code} className="w-4 h-3 ring-1 ring-[#2b2b2b]" />
                        <span className="tracking-wide">{l.short}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* MAIN */}
      <main id="cabo-main" className="w-full mobile-untrap-scroll">
        <div className="container py-8 sm:py-12">
          {children}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="cabo-public-footer">
        <div className="merchant">
          <span className="text-gray-400">{(translations[locale] || translations.en).merchantQ}</span>
          <Link href="/merchant/login" prefetch={false}>
            {(translations[locale] || translations.en).merchantAccess}
          </Link>
        </div>
        <div className="copy">
          &copy; 2025 {(translations[locale] || translations.en).copyright}
        </div>
      </footer>
    </div>
  );
}
