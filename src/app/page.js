// app/page.js
"use client";

/**
 * Homepage — inline i18n ile metinler bu dosyada tutulur.
 * Güvenlik/Stil notları:
 * - Görsel yapı korunmuştur.
 * - Erişilebilirlik için “skip to content” linki var.
 * - i18n: Önce yerel (inline) sözlük, sonra global useTranslation(), sonra key fallback.
 */

import React, { useMemo } from "react";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocale } from "@/context/LocaleContext";

// Inline sözlük (bu sayfaya özel)
const L = {
  en: {
    a11y_skip: "Skip to main content",
    heroTitleA: "Drop your link. ",
    heroTitleB: "Let the money flow.",
    heroDesc:
      "Cabo lets you earn by just sharing product links. When someone buys, cash is on the way.",
    loginBtn: "Start Earning Now",
  },
  tr: {
    a11y_skip: "Ana içeriğe geç",
    heroTitleA: "Drop your link. ",
    heroTitleB: "Let the money flow.",
    heroDesc:
      "Cabo, yalnızca ürün linklerini paylaşarak kazanmanı sağlar. Biri satın aldığında ödeme yoldadır.",
    loginBtn: "Hemen Kazanmaya Başla",
  },
};

export default function Homepage() {
  const { t } = useTranslation(); // global çeviri (genel anahtarlar için)
  const { locale = "en" } = useLocale() || {};

  // Sayfa içi çeviri yardımcı fonksiyonu
  const lt = useMemo(() => {
    const dict = L[locale] || L.en;
    return (key) => dict[key] ?? t(key) ?? key;
  }, [locale, t]);

  return (
    <PublicLayout>
      {/* Skip link (erişilebilirlik) */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:bg-[#1a1a1a] focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:z-50"
      >
        {lt("a11y_skip")}
      </a>

      <main
        id="main"
        role="main"
        className="flex-grow flex items-center justify-center px-3 sm:px-6 min-h-[65vh]"
      >
        <section className="max-w-4xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2 leading-tight sm:leading-[3.5rem]">
            <span className="text-[#d1ffd0]">{lt("heroTitleA")}</span>
            <span className="text-[#81d742]">{lt("heroTitleB")}</span>
          </h1>

          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-6">
            {lt("heroDesc")}
          </p>

          {/* LOGIN BUTTON */}
          <div className="flex justify-center mt-7">
            <Link
              href="/login"
              aria-label={lt("loginBtn")}
              prefetch
              className="
                bg-[#81d742]
                text-[#101010]
                hover:bg-[#baff7c]
                hover:text-[#121212]
                font-bold
                text-lg
                px-8 py-3
                rounded-xl
                shadow-md
                transition
                duration-200
                focus:outline-none
                focus:ring-2
                focus:ring-[#a2ff70]
                focus:ring-offset-2
                focus:ring-offset-[#0B0B0B]
                active:scale-95
              "
              style={{
                letterSpacing: "-0.01em",
                boxShadow: "0 4px 32px 0 rgba(129,215,66,0.08)",
              }}
            >
              {lt("loginBtn")}
            </Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
