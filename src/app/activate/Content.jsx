'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "@/hooks/useTranslation";

export default function ActivateContent() {
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const lang = params.get("lang");
  const { setLocale } = useLocale();
  const t = useTranslation();

  useEffect(() => {
    if (lang) setLocale(lang); // Lokalizasyon
  }, [lang, setLocale]);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg(t("activationFailed") || "Aktivasyon hatası, link eksik.");
      setTimeout(() => router.replace('/activated?error=1'), 3000);
      return;
    }
    fetch(`/api/activate?token=${encodeURIComponent(token)}`)
      .then(res => res.json().then(data => ({ ok: res.ok, ...data })))
      .then(data => {
        if (data.success) {
          setStatus('success');
          setTimeout(() => router.replace('/activated'), 2000);
        } else if (data.alreadyActive) {
          setStatus('success');
          setTimeout(() => router.replace('/activated'), 2000);
        } else {
          setStatus('error');
          // Hatalara göre farklı mesaj da gösterebilirsin
          let msg = t("activationFailed") || "Aktivasyon hatası.";
          if (data.error === "ratelimit") msg = t("activationRateLimit") || "Çok fazla deneme yaptınız, lütfen bekleyin.";
          if (data.error === "invalid") msg = t("activationInvalidToken") || "Aktivasyon linki geçersiz veya zaman aşımına uğradı.";
          if (data.error === "jwt") msg = t("activationJwtError") || "Link hatalı ya da süresi dolmuş.";
          setErrorMsg(msg);
          setTimeout(() => router.replace('/activated?error=1'), 3000);
        }
      })
      .catch(() => {
        setStatus('error');
        setErrorMsg(t("activationFailed") || "Aktivasyon hatası, tekrar deneyin.");
        setTimeout(() => router.replace('/activated?error=1'), 3000);
      });
  }, [token, router, t]);

  if (status === 'loading') return <div className="text-white text-center py-12">{t("activatingAccount") || "Hesabınız doğrulanıyor..."}</div>;
  if (status === 'success') return <div className="text-green-400 text-center py-12">{t("activationSuccess") || "Aktivasyon başarılı, giriş sayfasına yönlendiriliyorsunuz..."}</div>;
  return <div className="text-red-400 text-center py-12">{errorMsg}</div>;
}
