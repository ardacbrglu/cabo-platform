"use client";

/**
 * reCAPTCHA v2 Checkbox (explicit, sağlam)
 * - Token: onChange + window.__caboCaptchaToken + data-token (fallback için)
 * - Dil/tema değişince yeniden render
 * - resetKey gelince reset
 */

import { useEffect, useRef } from "react";

const SITE_KEY = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
const SRC_PRIMARY = "https://www.google.com/recaptcha/api.js";
const SRC_FALLBACK = "https://www.recaptcha.net/recaptcha/api.js";
const ONLOAD_FN = "__caboRecaptchaOnload";
const SCRIPT_ID = "cabo-recaptcha-v2";
const TOKEN_TTL_MS = 110 * 1000;

export default function Captcha({
  onChange,
  lang = "tr",
  resetKey = 0,
  theme = "light",
  skin = "card",
  className = "",
  style,
}) {
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const expireTimerRef = useRef(null);
  const currentLangRef = useRef(null);

  const setToken = (tok) => {
    try {
      if (wrapRef.current) {
        if (tok) wrapRef.current.setAttribute("data-token", tok);
        else wrapRef.current.removeAttribute("data-token");
      }
      if (tok) window.__caboCaptchaToken = tok;
      else delete window.__caboCaptchaToken;
    } catch {}
    onChange?.(tok || "");
  };

  const cleanupWidget = () => {
    try {
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
        expireTimerRef.current = null;
      }
      const gre = window.grecaptcha;
      if (widgetIdRef.current != null && gre?.reset) {
        gre.reset(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      if (boxRef.current) boxRef.current.innerHTML = "";
      setToken("");
    } catch {}
  };

  const loadScript = (hl) =>
    new Promise((resolve) => {
      const existed = document.getElementById(SCRIPT_ID);
      if (existed) existed.remove();

      if (!window[ONLOAD_FN]) {
        window[ONLOAD_FN] = () => resolve();
      }

      const mount = (src) => {
        const s = document.createElement("script");
        s.id = SCRIPT_ID;
        s.async = true;
        s.defer = true;
        s.src = `${src}?render=explicit&onload=${ONLOAD_FN}&hl=${encodeURIComponent(hl)}`;
        s.onerror = () => {
          if (src === SRC_PRIMARY) mount(SRC_FALLBACK);
          else resolve();
        };
        document.head.appendChild(s);
      };

      mount(SRC_PRIMARY);
    });

  useEffect(() => {
    if (!SITE_KEY) {
      setToken("");
      return;
    }

    let cancelled = false;
    const wantedLang = String(lang || "tr").slice(0, 2);

    const boot = async () => {
      if (currentLangRef.current !== wantedLang || !window.grecaptcha) {
        currentLangRef.current = wantedLang;
        cleanupWidget();
        await loadScript(wantedLang);
      }

      try {
        const gre = window.grecaptcha;
        if (!gre?.render || !boxRef.current) return;
        widgetIdRef.current = gre.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: theme === "dark" ? "dark" : "light",
          callback: (t) => {
            if (cancelled) return;
            setToken(t || "");
            if (t) {
              if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
              expireTimerRef.current = setTimeout(() => setToken(""), TOKEN_TTL_MS);
            }
          },
          "expired-callback": () => { if (!cancelled) setToken(""); },
          "error-callback":   () => { if (!cancelled) setToken(""); },
        });
      } catch {
        /* no-op */
      }
    };

    boot();
    return () => { cancelled = true; cleanupWidget(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, theme]);

  useEffect(() => {
    try {
      const gre = window.grecaptcha;
      if (widgetIdRef.current != null && gre?.reset) gre.reset(widgetIdRef.current);
    } catch {}
    setToken("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) {
    return (
      <div ref={wrapRef} className="cabo-recaptcha-wrap">
        <div className={`cabo-recaptcha-plate ${className}`} style={style}>
          <span className="text-red-400 text-sm">Missing NEXT_PUBLIC_RECAPTCHA_SITE_KEY</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`cabo-recaptcha-wrap ${className}`}
      style={style}
      aria-label="reCAPTCHA"
      role="group"
    >
      <div className={skin === "card" ? "cabo-recaptcha-plate" : ""}>
        <div className="cabo-recaptcha-clip">
          <div className="cabo-recaptcha-box">
            <div ref={boxRef} className="g-recaptcha" />
          </div>
        </div>
      </div>
    </div>
  );
}
