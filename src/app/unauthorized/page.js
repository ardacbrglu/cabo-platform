"use client";

import PublicLayout from "@/components/PublicLayout";
import Link from "next/link";
import { useLocale } from "@/context/LocaleContext";

const dict = {
  en: {
    title: "Unauthorized",
    desc: "You don't have permission to view this page.",
    goLogin: "Affiliate Login",
    goMerchantLogin: "Merchant Login",
    home: "Back to Home",
  },
  tr: {
    title: "Yetkisiz Erişim",
    desc: "Bu sayfayı görüntüleme izniniz yok.",
    goLogin: "Affiliate Girişi",
    goMerchantLogin: "Satıcı Girişi",
    home: "Ana sayfa",
  },
};

export default function UnauthorizedPage() {
  const { locale } = useLocale();
  const t = (k) => (dict[locale] || dict.en)[k] || k;

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto text-center bg-[#1a1a1a] border border-[#232323] rounded-2xl p-8 shadow">
        <h1 className="text-3xl font-extrabold text-[#d1ffd0] mb-3">{t("title")}</h1>
        <p className="text-gray-300 mb-6">{t("desc")}</p>
        <div className="flex flex-col gap-3">
          <Link href="/login" className="bg-white text-[#111] py-2 rounded hover:bg-[#e0ffe0] transition">
            {t("goLogin")}
          </Link>
          <Link href="/merchant/login" className="bg-[#81d742] text-[#0b0b0b] py-2 rounded hover:bg-[#aaff6c] transition">
            {t("goMerchantLogin")}
          </Link>
          <Link href="/" className="text-[#81d742] underline hover:text-[#b3ffb3] mt-1">
            {t("home")}
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
