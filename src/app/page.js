// app/page.js
"use client";

// Amaç: Ana sayfa (i18n: useTranslation, erişilebilirlik iyileştirmeleri).
// Not: Görsel stil korunur; sadece t hook'u doğru kullanıldı.

import PublicLayout from "@/components/PublicLayout";
import React from "react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";

export default function Homepage() {
  const { t } = useTranslation(); // <-- DÜZELTME: destructure

  return (
    <PublicLayout>
      {/* Skip link (erişilebilirlik) */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:bg-[#1a1a1a] focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:z-50"
      >
        {t("a11y.skipToContent") || "Skip to main content"}
      </a>

      <main
        id="main"
        role="main"
        className="flex-grow flex items-center justify-center px-3 sm:px-6 min-h-[65vh]"
      >
        <section className="max-w-4xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2 leading-tight sm:leading-[3.5rem]">
            <span className="text-[#d1ffd0]">{t("homepage.heroTitleA")}</span>
            <span className="text-[#81d742]">{t("homepage.heroTitleB")}</span>
          </h1>

          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-6">
            {t("homepage.heroDesc")}
          </p>

          {/* LOGIN BUTTON */}
          <div className="flex justify-center mt-7">
            <Link
              href="/login"
              aria-label={t("homepage.loginBtn")}
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
              {t("homepage.loginBtn")}
            </Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
