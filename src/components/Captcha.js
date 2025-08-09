// /components/Captcha.js
"use client";
/**
 * Captcha (Google reCAPTCHA v2) – Prod-ready
 * SECURITY NOTE:
 * - Frontend sadece token üretir. Sunucuda mutlaka "siteverify" ile doğrulayın.
 * - Env: NEXT_PUBLIC_RECAPTCHA_SITE_KEY zorunlu.
 * - Küçük ekranlarda otomatik "compact" boyut kullanılır.
 */
import React, { useEffect, useMemo, useRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function Captcha({
  onChange,        // (token: string|null) => void
  lang = "en",     // "tr" | "en" ...
  className = "",
  forceSize,       // "normal" | "compact" | undefined
}) {
  const ref = useRef(null);

  // Basit mobil algısı (SSR-safe)
  const isNarrow = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia && window.matchMedia("(max-width: 480px)").matches;
  }, []);

  useEffect(() => {
    if (!SITE_KEY) {
      console.warn("[Captcha] NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing.");
    }
  }, []);

  if (!SITE_KEY) {
    // Build-time’da key yoksa bileşeni boş geçmek daha güvenli (hydration sorununu önler)
    return (
      <div className={`text-sm text-red-400 ${className}`}>
        {/* Prod’da görülmemeli; sadece local/dev uyarısı */}
        reCAPTCHA key missing. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY.
      </div>
    );
  }

  const size = forceSize || (isNarrow ? "compact" : "normal");

  return (
    <div className={`flex justify-center my-2 ${className}`}>
      <ReCAPTCHA
        ref={ref}
        sitekey={SITE_KEY}
        onChange={onChange}
        onExpired={() => onChange?.(null)}
        onErrored={() => onChange?.(null)}
        hl={lang}
        theme="dark"
        size={size}
      />
    </div>
  );
}

/**
 * Parent örnek:
 * const [captcha, setCaptcha] = useState(null);
 * <Captcha onChange={setCaptcha} lang={user?.languagePreference || "en"} />
 * Submit’te: headers["x-recaptcha-token"] = captcha
 * Başarılı işlem sonrası: ref.current?.reset(); (gerekirse forwardRef ile genişletilebilir)
 */
