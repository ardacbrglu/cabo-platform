'use client';

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/context/LocaleContext";

// Bu sayfada dinamik import yapan i18n hook'unu (useTranslation) KULLANMIYORUZ.
// Minimal yerleşik sözlük (EN/TR)
const dict = {
  en: {
    loading: "Verifying your account...",
    ok: "Activation successful, redirecting to the login page...",
    fail: "Activation failed. Please try again.",
    ratelimit: "Too many attempts, please wait and try again.",
    invalid: "Activation link is invalid or has expired.",
    jwt: "Link is malformed or expired.",
  },
  tr: {
    loading: "Hesabınız doğrulanıyor...",
    ok: "Aktivasyon başarılı, giriş sayfasına yönlendiriliyorsunuz...",
    fail: "Aktivasyon hatası. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla deneme yaptınız, lütfen bekleyin.",
    invalid: "Aktivasyon linki geçersiz veya zaman aşımına uğradı.",
    jwt: "Link hatalı ya da süresi dolmuş.",
  },
};

export default function ActivateContent() {
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const urlLang = params.get("lang");

  const { locale, setLocale } = useLocale();

  // Aktif dil: URL'deki lang varsa onu kullan; yoksa mevcut LocaleContext
  const lang = (urlLang || (locale === "tr" ? "tr" : "en")).toLowerCase();
  const t = useMemo(() => (k) => (dict[lang]?.[k] ?? dict.en[k] ?? k), [lang]);

  // LocaleContext'i URL paramına eşitle (varsa)
  useEffect(() => {
    if (urlLang) setLocale(urlLang);
  }, [urlLang, setLocale]);

  useEffect(() => {
    const goActivated = (opts = {}) => {
      const qs = new URLSearchParams();
      if (opts.error) qs.set("error", "1");
      if (lang) qs.set("lang", lang);
      router.replace(`/activated${qs.toString() ? `?${qs}` : ""}`);
    };

    if (!token) {
      setStatus("error");
      setErrorMsg(t("fail"));
      setTimeout(() => goActivated({ error: true }), 2000);
      return;
    }

    // Aktivasyon: API çağrısı
    fetch(`/api/activate?token=${encodeURIComponent(token)}`, {
      headers: { "accept-language": lang || "en" },
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data.success || data.alreadyActive)) {
          setStatus("success");
          setTimeout(() => goActivated(), 1500);
        } else {
          setStatus("error");
          let msg = t("fail");
          if (data?.error === "ratelimit") msg = t("ratelimit");
          if (data?.error === "invalid") msg = t("invalid");
          if (data?.error === "jwt") msg = t("jwt");
          setErrorMsg(msg);
          setTimeout(() => goActivated({ error: true }), 2000);
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg(t("fail"));
        setTimeout(() => goActivated({ error: true }), 2000);
      });
  }, [token, router, lang, t]);

  if (status === "loading") {
    return <div className="text-white text-center py-12">{t("loading")}</div>;
  }
  if (status === "success") {
    return <div className="text-green-400 text-center py-12">{t("ok")}</div>;
  }
  return <div className="text-red-400 text-center py-12">{errorMsg}</div>;
}
