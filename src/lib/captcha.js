"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Google reCAPTCHA v3 helper (auto execute + refresh).
 * Env:
 *  - NEXT_PUBLIC_RECAPTCHA_SITE_KEY
 *  - RECAPTCHA_SECRET_KEY  (server-side doğrulama için sizde zaten var)
 */
export default function Captcha({
  onChange,
  lang = "en",
  action = "merchant_register",
}) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error
  const cleanupRef = useRef(() => {});
  const execRef = useRef(null);

  // script inject + first execute
  useEffect(() => {
    onChange?.(""); // temizle
    if (!siteKey) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    const ensureScript = () =>
      new Promise((resolve, reject) => {
        const id = "grecaptcha-v3";
        const existing = document.getElementById(id);
        if (existing && window.grecaptcha) return resolve();

        if (existing) {
          // script var ama grecaptcha hazır değil → bekle
          const wait = () => {
            if (window.grecaptcha) resolve();
            else setTimeout(wait, 120);
          };
          wait();
          return;
        }

        const s = document.createElement("script");
        s.id = id;
        s.async = true;
        s.defer = true;
        s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(
          siteKey
        )}&hl=${encodeURIComponent(lang)}`;
        s.onerror = () => reject(new Error("recaptcha_script_error"));
        document.head.appendChild(s);

        const wait = () => {
          if (window.grecaptcha) resolve();
          else setTimeout(wait, 120);
        };
        wait();

        cleanupRef.current = () => {
          // script'i kaldırmayalım; sayfada tekrar kullanılabilir.
        };
      });

    const execute = () => {
      if (!window.grecaptcha) return;
      setStatus("loading");
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(siteKey, { action })
          .then((token) => {
            if (cancelled) return;
            setStatus("ok");
            onChange?.(token);
          })
          .catch(() => {
            if (cancelled) return;
            setStatus("error");
            onChange?.("");
          });
      });
    };

    ensureScript()
      .then(() => {
        if (cancelled) return;
        execRef.current = execute;
        execute();
      })
      .catch(() => setStatus("error"));

    // token TTL ~2dk → 100sn’de bir yenile
    const int = setInterval(() => {
      if (execRef.current) execRef.current();
    }, 100 * 1000);

    return () => {
      cancelled = true;
      clearInterval(int);
      cleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, siteKey, action]);

  const retry = () => {
    if (execRef.current) execRef.current();
  };

  return (
    <div className="text-xs text-gray-400 select-none">
      {status === "error" ? (
        <div className="text-red-400">
          reCAPTCHA yüklenemedi. Tarayıcı eklentileri/CSP engelliyor olabilir.{" "}
          <button
            type="button"
            onClick={retry}
            className="underline hover:opacity-80"
          >
            Tekrar dene
          </button>
        </div>
      ) : (
        <span>Protected by reCAPTCHA.</span>
      )}
    </div>
  );
}
