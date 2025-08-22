"use client";

/**
 * File: src/components/Captcha.jsx
 * Purpose: reCAPTCHA (v2 checkbox or v3 invisible) with robust loader
 * Security Docblock:
 * - Uses only NEXT_PUBLIC_* vars on client; secret yok.
 * - v2 için ?render=explicit; auto-render kapalı (data-sitekey gerekmez).
 * - Prod’da token loglanmaz; Dev’de kısmi debug (site key ilk/son 6).
 */

import { useEffect, useRef, useState } from "react";

const MODE = (process.env.NEXT_PUBLIC_RECAPTCHA_MODE || "v2").toLowerCase();
// trim: .env’de yanlışlıkla bırakılan boşlukları telafi et
const SITE_KEY = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();

export default function Captcha({ onChange, lang = "tr", action = "form_submit" }) {
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const execRef = useRef(null);
  const renewTimerRef = useRef(null);

  useEffect(() => {
    onChange?.(""); // mount’ta tokenı sıfırla

    if (!SITE_KEY) {
      setErr("missing-sitekey");
      return;
    }

    const scriptId = "recaptcha-script";

    // Doğru src’yi hesapla
    const params = new URLSearchParams();
    params.set("hl", lang);
    if (MODE === "v3") params.set("render", SITE_KEY);
    else params.set("render", "explicit");
    const desiredSrc = `https://www.google.com/recaptcha/api.js?${params.toString()}`;

    // Eğer daha önce farklı src ile yüklenmişse, eskisini kaldır
    const existing = document.getElementById(scriptId);
    if (existing && existing.getAttribute("src") !== desiredSrc) {
      existing.remove();
    }

    function waitReady(resolve) {
      if (window.grecaptcha?.ready) return resolve();
      const t = setInterval(() => {
        if (window.grecaptcha?.ready) {
          clearInterval(t);
          resolve();
        }
      }, 60);
    }

    function load() {
      return new Promise((resolve) => {
        if (window.grecaptcha?.ready) return resolve();

        const now = document.getElementById(scriptId);
        if (now) return waitReady(resolve);

        const s = document.createElement("script");
        s.id = scriptId;
        s.src = desiredSrc;
        s.async = true;
        s.defer = true;
        s.onload = () => waitReady(resolve);
        document.head.appendChild(s);
      });
    }

    const mount = async () => {
      if (process.env.NODE_ENV !== "production") {
        const short = SITE_KEY.length > 12
          ? `${SITE_KEY.slice(0, 6)}...${SITE_KEY.slice(-6)}`
          : "(short)";
        // Public key olduğundan dev’de bu kadarlık log güvenli
        console.debug("[reCAPTCHA] mode:", MODE, "siteKey:", short);
      }

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
          renewTimerRef.current = setInterval(exec, 90 * 1000);
          return;
        }

        // v2 checkbox — explicit render
        try {
          widgetIdRef.current = window.grecaptcha.render(boxRef.current, {
            sitekey: SITE_KEY,
            theme: "dark",
            callback: (t) => onChange?.(t || ""),
            "expired-callback": () => onChange?.(""),
            "error-callback": () => onChange?.(""),
          });
        } catch (e) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[reCAPTCHA] render error:", e);
          }
          setErr("render-failed");
        }
      });
    };

    mount();

    return () => {
      if (renewTimerRef.current) clearInterval(renewTimerRef.current);
      try {
        if (widgetIdRef.current != null && window.grecaptcha?.reset) {
          window.grecaptcha.reset(widgetIdRef.current);
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, onChange]);

  if (err === "missing-sitekey") {
    return (
      <div className="text-red-400 text-sm">
        reCAPTCHA misconfigured: missing <code>NEXT_PUBLIC_RECAPTCHA_SITE_KEY</code>.
      </div>
    );
  }
  if (err === "render-failed") {
    return (
      <div className="text-red-400 text-sm">
        reCAPTCHA failed to render. Check site key type & allowed domains.
      </div>
    );
  }

  // v3 görünmez; v2 için explicit render hedefi
  return MODE === "v3" ? (
    <div className="text-[12px] text-gray-500 -mt-2">Protected by reCAPTCHA.</div>
  ) : (
    <div ref={boxRef} />
  );
}
