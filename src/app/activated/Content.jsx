'use client';

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useLocale } from "@/context/LocaleContext";

// Bu sayfada da dinamik i18n kullanmıyoruz (aynı sebep).
const dict = {
  en: {
    ok: "Your account has been activated! Redirecting to the login page...",
    fail: "Activation failed or link is invalid.",
  },
  tr: {
    ok: "Hesabınız aktifleştirildi! Giriş sayfasına yönlendiriliyorsunuz...",
    fail: "Aktivasyon başarısız veya link geçersiz.",
  },
};

export default function ActivatedContent() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");
  const urlLang = params.get("lang");
  const { setLocale, locale } = useLocale();

  const lang = (urlLang || (locale === "tr" ? "tr" : "en")).toLowerCase();
  const t = useMemo(() => (k) => (dict[lang]?.[k] ?? dict.en[k] ?? k), [lang]);

  useEffect(() => {
    if (urlLang) setLocale(urlLang);
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 1800);
    return () => clearTimeout(timer);
  }, [urlLang, setLocale, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      {error ? (
        <div className="text-red-400 text-lg">{t("fail")}</div>
      ) : (
        <div className="text-green-400 text-lg mb-6">{t("ok")}</div>
      )}
    </div>
  );
}
