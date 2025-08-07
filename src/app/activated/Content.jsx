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
    // 2 saniye sonra login ekranına yönlendir
    const timer = setTimeout(() => {
      router.replace("/login");
    }, 2000);
    return () => clearTimeout(timer);
  }, [lang, setLocale, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      {error ? (
        <div className="text-red-400 text-lg">
          {t("activationFailed") || "Aktivasyon başarısız veya link geçersiz."}
        </div>
      ) : (
        <div className="text-green-400 text-lg mb-6">
          {t("activationSuccess") || "Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz..."}
        </div>
      )}
    </div>
  );
}
