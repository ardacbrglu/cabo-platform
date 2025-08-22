"use client";

/**
 * reCAPTCHA (v2 checkbox veya v3 invisible) — ENV ile seçilir.
 * ENV:
 *   NEXT_PUBLIC_RECAPTCHA_MODE = "v2" | "v3"   (varsayılan: "v2")
 *   NEXT_PUBLIC_RECAPTCHA_SITE_KEY = <site key>
 *
 * Kullanım: <Captcha onChange={setCaptcha} lang={locale} action="register" />
 */

import { useEffect, useRef } from "react";

const MODE = (process.env.NEXT_PUBLIC_RECAPTCHA_MODE || "v2").toLowerCase();
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function Captcha({ onChange, lang = "en", action = "form_submit" }) {
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const execRef = useRef(null);
  const renewTimerRef = useRef(null);

  useEffect(() => {
    // her mount’ta token’ı temizle
    onChange?.("");

    if (!SITE_KEY) {
      console.warn("[reCAPTCHA] site key missing");
      return;
    }

    const scriptId = "recaptcha-script";
    const renderParam = MODE === "v3" ? `?render=${encodeURIComponent(SITE_KEY)}` : "";
    const src = `https://www.google.com/recaptcha/api.js${renderParam}&hl=${encodeURIComponent(lang)}`;

    function load() {
      return new Promise((resolve) => {
        if (window.grecaptcha?.ready) return resolve();
        const existing = document.getElementById(scriptId);
        if (existing) {
          const t = setInterval(() => {
            if (window.grecaptcha?.ready) {
              clearInterval(t);
              resolve();
            }
          }, 60);
          return;
        }
        const s = document.createElement("script");
        s.id = scriptId;
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = resolve;
        document.head.appendChild(s);
      });
    }

    const mount = async () => {
      await load();

      window.grecaptcha.ready(() => {
        if (MODE === "v3") {
          const exec = () =>
            window.grecaptcha
              .execute(SITE_KEY, { action })
              .then((t) => onChange?.(t || ""))
              .catch(() => onChange?.(""));
          execRef.current = exec;
          exec(); // ilk token
          renewTimerRef.current = setInterval(exec, 90 * 1000); // token tazele
          return;
        }

        // v2 checkbox
        if (boxRef.current && widgetIdRef.current == null) {
          widgetIdRef.current = window.grecaptcha.render(boxRef.current, {
            sitekey: SITE_KEY,
            theme: "dark",
            callback: (t) => onChange?.(t || ""),
            "expired-callback": () => onChange?.(""),
            "error-callback": () => onChange?.(""),
          });
        }
      });
    };

    mount();

    return () => {
      if (renewTimerRef.current) clearInterval(renewTimerRef.current);
      // v2 için: gerekirse reset (opsiyonel)
      try {
        if (widgetIdRef.current != null && window.grecaptcha?.reset) {
          window.grecaptcha.reset(widgetIdRef.current);
        }
      } catch {}
    };
    // lang değiştiğinde script’i yeniden yüklemiyoruz (Google bu konuda kaprisli).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, onChange]);

  // v3 görünmez, v2 checkbox görünür
  return MODE === "v3" ? (
    <div className="text-[12px] text-gray-500 -mt-2">Protected by reCAPTCHA.</div>
  ) : (
    <div className="g-recaptcha" ref={boxRef} />
  );
}
