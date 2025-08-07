'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "@/hooks/useTranslation";

export default function ActivateContent() {
  const [status, setStatus] = useState('loading');
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const lang = params.get("lang");
  const { setLocale } = useLocale();
  const t = useTranslation();

  useEffect(() => {
    if (lang) setLocale(lang); // Aktivasyon linkiyle gelen dil, locale olarak ayarlanır
  }, [lang, setLocale]);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setTimeout(() => router.replace('/activated?error=1'), 2000);
      return;
    }
    fetch(`/api/activate?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (res.redirected) {
          router.replace(res.url.replace(/^.*\/\/[^\/]+/, ''));
        } else if (res.ok) {
          setStatus('success');
          setTimeout(() => router.replace('/activated'), 2000);
        } else {
          setStatus('error');
          setTimeout(() => router.replace('/activated?error=1'), 2000);
        }
      })
      .catch(() => {
        setStatus('error');
        setTimeout(() => router.replace('/activated?error=1'), 2000);
      });
  }, [token, router]);

  if (status === 'loading') return <div className="text-white text-center py-12">{t("activatingAccount") || "Hesabınız doğrulanıyor..."}</div>;
  if (status === 'success') return <div className="text-green-400 text-center py-12">{t("activationSuccess") || "Aktivasyon başarılı, giriş sayfasına yönlendiriliyorsunuz..."}</div>;
  return <div className="text-red-400 text-center py-12">{t("activationFailed") || "Aktivasyon hatası. Lütfen tekrar deneyin."}</div>;
}
