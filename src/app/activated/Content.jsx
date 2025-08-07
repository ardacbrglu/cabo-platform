'use client';
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "@/hooks/useTranslation";

export default function ActivatedContent() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");
  const lang = params.get("lang");
  const { setLocale } = useLocale();
  const t = useTranslation();

  useEffect(() => {
    if (lang) setLocale(lang);
    const timer = setTimeout(() => router.replace("/login"), 3000);
    return () => clearTimeout(timer);
  }, [router, lang, setLocale]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      {error ?
        <div className="text-red-400 text-lg">{t("activationFailed") || "Aktivasyon başarısız veya link geçersiz."}</div>
        :
        <div className="text-green-400 text-lg">{t("activationSuccess") || "Aktivasyon başarılı! Şimdi giriş yapabilirsiniz."}</div>
      }
      <div className="mt-4 text-gray-400 text-sm">{t("redirectingToLogin") || "Giriş sayfasına yönlendiriliyorsunuz..."}</div>
    </div>
  );
}
