"use client";

/**
 * File: src/components/Captcha.jsx
 * Purpose: reCAPTCHA v3 token üretimi + 100sn'de bir otomatik yenileme.
 * Env: NEXT_PUBLIC_RECAPTCHA_SITE_KEY zorunlu.
 */

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function Captcha({ onChange, action = "form_submit", lang = "en" }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) {
      console.warn("reCAPTCHA site key missing");
      onChange?.("");
      return;
    }

    const ensureScript = () =>
      new Promise((resolve) => {
        if (window.grecaptcha?.execute) return resolve();
        const id = "grecaptcha-js";
        if (document.getElementById(id)) {
          const int = setInterval(() => {
            if (window.grecaptcha?.execute) {
              clearInterval(int);
              resolve();
            }
          }, 50);
          return;
        }
        const s = document.createElement("script");
        s.id = id;
        s.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}&hl=${lang}`;
        s.async = true;
        s.defer = true;
        s.onload = resolve;
        document.head.appendChild(s);
      });

    const getToken = async () => {
      try {
        await ensureScript();
        await window.grecaptcha.ready();
        const token = await window.grecaptcha.execute(SITE_KEY, { action });
        onChange?.(token || "");
      } catch {
        onChange?.("");
      }
    };

    // İlk token ve periyodik yenileme (100 sn)
    getToken();
    timerRef.current = setInterval(getToken, 100 * 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onChange, action, lang]);

  // v3 görünmezdir; kullanıcıya küçük bir not bırakabiliriz.
  return (
    <div className="text-[12px] text-gray-500 -mt-2">
      Protected by reCAPTCHA.
    </div>
  );
}
