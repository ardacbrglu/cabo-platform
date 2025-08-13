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

  const { locale, setLocale } = useLocale();
  const t = useTranslation();

  // Aktif dil: URL'deki lang varsa onu kullan; yoksa mevcut locale'den üret
  const activeLang = lang || (locale === "tr" ? "tr" : "en");

  useEffect(() => {
    if (lang) setLocale(lang); // Lokalizasyon
  }, [lang, setLocale]);

  useEffect(() => {
    const goActivated = (opts = {}) => {
      const qs = new URLSearchParams();
      if (opts.error) qs.set("error", "1");
      if (activeLang) qs.set("lang", activeLang);
      router.replace(`/activated${qs.toString() ? `?${qs}` : ""}`);
    };

    if (!token) {
      setStatus('error');
      setErrorMsg(t("activationFailed") || "Aktivasyon hatası, link eksik.");
      setTimeout(() => goActivated({ error: true }), 3000);
      return;
    }

    fetch(`/api/activate?token=${encodeURIComponent(token)}`, {
      headers: {
        "accept-language": activeLang || "en",
      },
      cache: "no-store",
    })
      .then(res => res.json().then(data => ({ ok: res.ok, ...data })))
      .then(data => {
        if (data.success || data.alreadyActive) {
          setStatus('success');
          setTimeout(() => goActivated(), 2000);
        } else {
          setStatus('error');
          let msg = t("activationFailed") || "Aktivasyon hatası.";
          if (data.error === "ratelimit") msg = t("activationRateLimit") || "Çok fazla deneme yaptınız, lütfen bekleyin.";
          if (data.error === "invalid") msg = t("activationInvalidToken") || "Aktivasyon linki geçersiz veya zaman aşımına uğradı.";
          if (data.error === "jwt") msg = t("activationJwtError") || "Link hatalı ya da süresi dolmuş.";
          setErrorMsg(msg);
          setTimeout(() => goActivated({ error: true }), 3000);
        }
      })
      .catch(() => {
        setStatus('error');
        setErrorMsg(t("activationFailed") || "Aktivasyon hatası, tekrar deneyin.");
        setTimeout(() => goActivated({ error: true }), 3000);
      });
  }, [token, router, t, activeLang]);

  if (status === 'loading') {
    return <div className="text-white text-center py-12">{t("activatingAccount") || "Hesabınız doğrulanıyor..."}</div>;
  }
  if (status === 'success') {
    return <div className="text-green-400 text-center py-12">{t("activationSuccess") || "Aktivasyon başarılı, giriş sayfasına yönlendiriliyorsunuz..."}</div>;
  }
  return <div className="text-red-400 text-center py-12">{errorMsg}</div>;
}
