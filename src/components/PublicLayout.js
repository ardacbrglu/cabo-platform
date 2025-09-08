"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { Menu, Globe, ChevronDown, ChevronRight } from "lucide-react";

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * Security Docblock (Cabo PROD)
 * - Sadece client-side UI; gizli anahtar/credential içermez.
 * - Auth/authorization kararı vermez; public nav + language UI.
 * - XSS: Metinler sabit sözlükten; kullanıcı girdisi render edilmez.
 * - Linkler Next <Link> (prefetch=false); harici domain yönlendirmesi yok.
 * - Mobil menü: header altında, edge-band ve ekran genişliğinde (affiliate ile aynı).
 * - İnce çizgi için border kaldırıldı; shadow/outline yok.
 * - Event listener’lar mount/unmount’ta düzgün yönetilir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

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
  { code: "tr", short: "TR" },
  { code: "en", short: "EN" },
];

/* ——— Flags ——— */
function FlagTR({ className = "w-4 h-3" }) {
  return (
    <svg viewBox="0 0 18 12" className={`${className} rounded-[2px]`} aria-hidden="true">
      <rect width="18" height="12" fill="#E30A17" />
      <circle cx="7.2" cy="6" r="3.05" fill="#fff" />
      <circle cx="8.1" cy="6" r="2.45" fill="#E30A17" />
      <polygon
        fill="#fff"
        points="10.5,6 11.25,6.22 11.05,5.49 11.6,5 10.84,4.93 10.5,4.25 10.16,4.93 9.4,5 9.95,5.49 9.75,6.22"
      />
    </svg>
  );
}
function FlagUS({ className = "w-4 h-3" }) {
  return (
    <svg viewBox="0 0 19 12" className={`${className} rounded-[2px]`} aria-hidden="true">
      <rect width="19" height="12" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map((y) => (
        <rect key={y} x="0" y={y} width="19" height="1" fill="#fff" />
      ))}
      <rect x="0" y="0" width="8" height="7" fill="#3C3B6E" />
      {[1.2, 3.6, 2.4, 4.8].map((x, i) => (
        <circle key={i} cx={x * 1.5} cy={2 + i} r="0.25" fill="#fff" />
      ))}
    </svg>
  );
}
const Flag = ({ code, className }) => (code === "tr" ? <FlagTR className={className} /> : <FlagUS className={className} />);

/* ——— SPA path watcher ——— */
function usePathnameSafe() {
  const [path, setPath] = useState("/");
  useEffect(() => {
    const update = () => {
      try {
        setPath(window.location.pathname || "/");
      } catch {}
    };
    update();

    const patch = (type) => {
      try {
        const orig = history[type];
        return function (...args) {
          const ret = orig.apply(history, args);
          try {
            window.dispatchEvent(new Event("locationchange"));
          } catch {}
          return ret;
        };
      } catch {
        return (..._args) => {};
      }
    };

    try {
      history.pushState = patch("pushState");
      history.replaceState = patch("replaceState");
    } catch {}

    window.addEventListener("popstate", update);
    window.addEventListener("locationchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("locationchange", update);
    };
  }, []);
  return path;
}

export default function PublicLayout({ children }) {
  const { locale, setLocale, persistLocale, ready } = useLocale();

  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false); // desktop language
  const langRef = useRef(null);

  const currentPath = usePathnameSafe();

  // viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // path değişince panelleri kapat
  useEffect(() => {
    setMobileOpen(false);
    setMobileLangOpen(false);
    setLangOpen(false);
  }, [currentPath]);

  // outside click & Esc
  useEffect(() => {
    const onDocClick = (e) => {
      if (!langRef.current) return;
      if (!langRef.current.contains(e.target)) setLangOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setLangOpen(false);
        setMobileLangOpen(false);
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

  const dict = translations[locale] || translations.en;
  const t = (k) => dict[k] || String(k);

  const activeLangCode = String(locale).toLowerCase().startsWith("tr") ? "tr" : "en";
  const activeLang = LANGS.find((l) => l.code === activeLangCode) || LANGS[1];
  const setLangPersist = (code) => (typeof persistLocale === "function" ? persistLocale(code) : setLocale?.(code));

  const navLinks = [
    { href: "/", label: t("home") },
    { href: "/faq", label: t("faq") },
    { href: "/login", label: t("login") },
    { href: "/register", label: t("register") },
  ];
  const isActive = (href) => currentPath === href;
  const linkClassDesktop = (href) =>
    `inline-block transition hover:text-[#81d742] ${
      isActive(href) ? "text-[#81d742] font-semibold" : "text-gray-200"
    }`;

  return (
    <div className="public-shell">
      {/* HEADER — affiliate ile aynı edge-band */}
      <header className="public-header relative z-[1000]">
        <div className="edge-band h-full flex items-center justify-between">
          <Link href="/" prefetch={false} className="brand-cabo select-none" aria-label="Cabo homepage">
            Cabo
          </Link>

          {/* Desktop nav */}
          {!isMobile ? (
            <nav aria-label="Public navigation" className="relative">
              <ul className="flex gap-7 text-sm font-medium items-center">
                {navLinks.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={linkClassDesktop(item.href)}
                      prefetch={false}
                      aria-current={isActive(item.href) ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}

                {/* Desktop language (bayraklı) */}
                <li className="ml-2 relative" ref={langRef}>
                  <button
                    type="button"
                    className="px-2 py-1 rounded transition flex items-center gap-2 text-gray-200 hover:text-[#b0f7a2]"
                    aria-label="Change language"
                    aria-haspopup="menu"
                    aria-expanded={langOpen}
                    onClick={() => setLangOpen((s) => !s)}
                    style={{ outline: "none" }}
                  >
                    <Globe size={18} />
                    <span className="hidden sm:inline-block">{activeLang.short}</span>
                    <ChevronDown size={16} className={`transition ${langOpen ? "rotate-180" : ""}`} />
                  </button>

                  {langOpen && (
                    <div
                      role="menu"
                      aria-label="Language selector"
                      className="absolute right-0 mt-2 w-36 rounded-xl border border-[#242424] bg-[#0f0f0f] shadow-[0_8px_24px_rgba(0,0,0,0.45)] p-1 z-50"
                    >
                      {LANGS.map((l) => {
                        const active = activeLang.code === l.code;
                        return (
                          <button
                            key={l.code}
                            type="button"
                            onClick={() => {
                              setLangPersist(l.code);
                              setLangOpen(false);
                            }}
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
              onClick={() => setMobileOpen((s) => !s)}
              className="text-white"
              type="button"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <Menu size={24} />
            </button>
          )}
        </div>

        {/* MOBILE panel — header altında, edge-band, BORDER YOK (ince çizgi kaldırıldı) */}
        {isMobile && mobileOpen && (
          <div className="edge-band pb-3 pt-2 bg-[#111] text-sm allow-inner-scroll">
            {/* nav links */}
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className={`block py-2 transition ${
                  isActive(l.href) ? "text-[#81d742] font-semibold" : "text-gray-300 hover:text-white"
                }`}
                aria-current={isActive(l.href) ? "page" : undefined}
              >
                {l.label}
              </Link>
            ))}

            {/* language (dokununca bayraklı TR/EN açılır) */}
            <div className="mt-2 pt-2">
              <button
                type="button"
                className="w-full flex items-center justify-between py-2 text-gray-300 hover:text-white transition"
                onClick={() => setMobileLangOpen((s) => !s)}
                aria-haspopup="menu"
                aria-expanded={mobileLangOpen}
                aria-label={dict.language}
                style={{ outline: "none" }}
              >
                <span className="inline-flex items-center gap-2">
                  <Globe size={16} />
                  <span className="uppercase tracking-wide">{dict.language}</span>
                </span>
                <ChevronRight size={16} className={`transition ${mobileLangOpen ? "rotate-90" : ""}`} />
              </button>

              {mobileLangOpen && (
                <div role="menu" aria-label="Language selector" className="mt-1 p-1 rounded-lg bg-[#101010]">
                  {LANGS.map((l) => {
                    const active = activeLang.code === l.code;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => setLangPersist(l.code)}
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
      <main id="cabo-main" className="bg-transparent">
        <div className="container">{children}</div>
      </main>

      {/* FOOTER — mobil kompakt, hizalama iyileştirildi; desktop aynı */}
      <footer className="cabo-public-footer text-gray-500 text-xs font-mono border-t border-[#232323] shrink-0">
        <div className="edge-band py-2 md:py-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            {/* Merchant callout */}
            <div className="merchant text-center md:text-left">
              <span className="block md:inline text-[11px] md:text-xs text-gray-400">
                {dict.merchantQ}
              </span>
              <Link
                href="/merchant/login"
                prefetch={false}
                className="inline-block mt-1 md:mt-0 md:ml-2 text-[11px] md:text-xs px-2 py-1 rounded-full border border-[#2b2b2b] text-[#81d742] hover:opacity-90 transition"
              >
                {dict.merchantAccess}
              </Link>
            </div>

            {/* Copyright */}
            <div className="copy text-center md:text-right text-[10px] md:text-xs">
              &copy; 2025 {dict.copyright}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
