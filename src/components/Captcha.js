"use client";

import { useEffect, useRef, useState } from "react";

/**
 * reCAPTCHA v2 Checkbox (dark)
 * - Script tek sefer yüklenir (dil değişince yenilenir)
 * - Doğal görünüm: ekstra kırpma/maske yok
 * - onChange(token|string) + dış reset (resetKey)
 */

const SITE_KEY = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
const TOKEN_TTL_MS = 110 * 1000;

export default function Captcha({ onChange, lang = "tr", resetKey = 0 }) {
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const expireTimerRef = useRef(null);
  const epochRef = useRef(0);

  // external reset
  useEffect(() => {
    try {
      if (widgetIdRef.current != null && window.grecaptcha?.reset) {
        window.grecaptcha.reset(widgetIdRef.current);
        onChange?.("");
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!SITE_KEY) { setErr("missing-sitekey"); return; }
    setErr("");

    const epoch = ++epochRef.current;
    if (expireTimerRef.current) { clearTimeout(expireTimerRef.current); expireTimerRef.current = null; }
    try { widgetIdRef.current = null; if (boxRef.current) boxRef.current.innerHTML = ""; } catch {}

    const SCRIPT_ID = "recaptcha-v2-script";
    const src = `https://www.google.com/recaptcha/api.js?hl=${encodeURIComponent(lang)}&onload=__caboRecaptchaOnload&render=explicit`;

    // dil değiştiyse script’i yenile
    const old = document.getElementById(SCRIPT_ID);
    if (old && old.getAttribute("src") !== src) {
      old.remove();
      try { delete window.grecaptcha; } catch {}
    }

    function ensureScript() {
      return new Promise((resolve) => {
        const exists = document.getElementById(SCRIPT_ID);
        if (exists) return resolve();
        const s = document.createElement("script");
        s.id = SCRIPT_ID; s.src = src; s.async = true; s.defer = true;
        s.onerror = () => setErr("render-failed");
        document.head.appendChild(s);
        resolve();
      });
    }

    // global onload
    window.__caboRecaptchaOnload = () => {
      if (epoch !== epochRef.current) return;
      try {
        widgetIdRef.current = window.grecaptcha.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (t) => {
            onChange?.(t || "");
            if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
            expireTimerRef.current = setTimeout(() => onChange?.(""), TOKEN_TTL_MS);
          },
          "expired-callback": () => { onChange?.(""); },
          "error-callback": () => { onChange?.(""); },
        });
        setErr("");
      } catch { setErr("render-failed"); }
    };

    ensureScript().then(() => {
      if (window.grecaptcha?.render) window.__caboRecaptchaOnload();
    });

    return () => {
      if (expireTimerRef.current) { clearTimeout(expireTimerRef.current); expireTimerRef.current = null; }
      try { if (widgetIdRef.current != null && window.grecaptcha?.reset) window.grecaptcha.reset(widgetIdRef.current); } catch {}
    };
  }, [lang, onChange]);

  const errorMsg =
    err === "missing-sitekey"
      ? "reCAPTCHA misconfigured: missing NEXT_PUBLIC_RECAPTCHA_SITE_KEY."
      : err === "render-failed"
      ? "reCAPTCHA failed to render. Check site key type & allowed domains."
      : "";

  return (
    <div aria-label="reCAPTCHA" role="group">
      {/* Doğal görünüm için sadece hafif, tarafsız bir sarmalayıcı */}
      <div className="cabo-recaptcha-clip">
        <div className="cabo-recaptcha-box">
          {errorMsg ? (
            <div className="cabo-recaptcha-fallback" aria-hidden="true">
              <span className="text-[11px] text-gray-400">reCAPTCHA</span>
            </div>
          ) : (
            <div ref={boxRef} className="g-recaptcha" />
          )}
        </div>
      </div>
      {errorMsg && <div className="mt-2 text-red-400 text-sm">{errorMsg}</div>}
    </div>
  );
}
