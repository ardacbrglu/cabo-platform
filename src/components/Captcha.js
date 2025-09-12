"use client";

/**
 * reCAPTCHA v2 Checkbox — desktop/mobil sağlam
 * - Script tek sefer yüklenir (google.com -> recaptcha.net fallback)
 * - Desktop: doğal boyut, tam merkez
 * - Mobil: container dar ise transform:scale; 260px altı 'compact' yeniden render
 * - DEV/localhost/LAN: gerçek site key yoksa veya host local ise TEST SITE KEY
 * - Token TTL (110s) + temiz cleanup
 */

import { useEffect, useMemo, useRef, useState } from "react";

const TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"; // Google v2 checkbox test key
const SITE_KEY_RAW = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();

const ONLOAD_FN = "__caboRecaptchaOnload";
const SCRIPT_ID = "cabo-recaptcha-v2-script";
const PRIMARY = "https://www.google.com/recaptcha/api.js";
const FALLBACK = "https://www.recaptcha.net/recaptcha/api.js";
const TOKEN_TTL_MS = 110 * 1000;

// v2 checkbox doğal ölçüleri
const BASE_W = 302;
const BASE_H = 78;

let scriptPromise = null;
let scriptLang = null;

function isLocalLikeHost(h) {
  const hn = String(h || "").split(":")[0];
  return (
    /^localhost$/i.test(hn) ||
    /^127\./.test(hn) ||
    /^10\./.test(hn) ||
    /^192\.168\./.test(hn) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hn)
  );
}

function loadScriptOnce(langCode) {
  if (typeof window === "undefined") return Promise.resolve();
  if (scriptPromise && scriptLang === langCode) return scriptPromise;

  scriptLang = langCode;
  scriptPromise = new Promise((resolve) => {
    const existed = document.getElementById(SCRIPT_ID);
    if (existed) existed.remove();

    if (!window[ONLOAD_FN]) window[ONLOAD_FN] = () => resolve();

    const mount = (src) => {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.async = true;
      s.defer = true;
      s.src = `${src}?render=explicit&onload=${ONLOAD_FN}&hl=${encodeURIComponent(langCode)}`;
      s.onerror = () => {
        if (src === PRIMARY) mount(FALLBACK);
        else resolve(); // ikisi de engelliyse yine render deneyeceğiz
      };
      document.head.appendChild(s);
    };

    mount(PRIMARY);
  });

  return scriptPromise;
}

export default function Captcha({
  onChange,
  lang = "tr",
  theme = "light",
  className = "",
  style,
}) {
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const shellRef = useRef(null);
  const widgetIdRef = useRef(null);
  const expireRef = useRef(null);

  const hl = useMemo(() => String(lang || "tr").slice(0, 2), [lang]);

  // siteKey seçimi (prod dışı + local host’ta test key’i zorla)
  const siteKey = useMemo(() => {
    if (process.env.NODE_ENV !== "production") {
      try {
        const host = typeof window !== "undefined" ? window.location.hostname : "";
        if (!SITE_KEY_RAW || isLocalLikeHost(host)) return TEST_SITE_KEY;
      } catch {
        if (!SITE_KEY_RAW) return TEST_SITE_KEY;
      }
    }
    return SITE_KEY_RAW;
  }, []);

  // ölçek/compact kararı
  const [scale, setScale] = useState(1);
  const [useCompact, setUseCompact] = useState(false);

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

  const cleanup = () => {
    try {
      if (expireRef.current) { clearTimeout(expireRef.current); expireRef.current = null; }
      const gre = window.grecaptcha;
      if (widgetIdRef.current != null && gre?.reset) gre.reset(widgetIdRef.current);
      widgetIdRef.current = null;
      if (boxRef.current) boxRef.current.innerHTML = "";
      setToken("");
    } catch {}
  };

  // container genişliğini dinle → scale/compact
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver((ents) => {
      for (const e of ents) {
        const w = Math.max(0, Math.floor(e.contentRect.width));
        const compact = w > 0 && w < 260;      // 260px altı compact
        setUseCompact(compact);
        const s = compact ? 1 : Math.max(0.5, Math.min(1, w / BASE_W)); // büyütme yok
        setScale(s);
        if (shellRef.current) shellRef.current.style.width = `${BASE_W}px`;
      }
    });
    ro.observe(el);
    return () => { try { ro.disconnect(); } catch {} };
  }, []);

  // render
  useEffect(() => {
    let cancelled = false;

    if (!siteKey) { setToken(""); return; }

    const render = () => {
      const gre = window.grecaptcha;
      if (!gre?.render || !boxRef.current) return;

      try {
        widgetIdRef.current = gre.render(boxRef.current, {
          sitekey: siteKey,
          theme: theme === "dark" ? "dark" : "light",
          size: useCompact ? "compact" : "normal",
          callback: (t) => {
            if (cancelled) return;
            setToken(t || "");
            if (t) {
              if (expireRef.current) clearTimeout(expireRef.current);
              expireRef.current = setTimeout(() => setToken(""), TOKEN_TTL_MS);
            }
          },
          "expired-callback": () => { if (!cancelled) setToken(""); },
          "error-callback":   () => { if (!cancelled) setToken(""); },
        });
      } catch {}
    };

    const boot = async () => {
      await loadScriptOnce(hl);
      try {
        const gre = window.grecaptcha;
        if (gre?.ready) gre.ready(() => !cancelled && render());
        else render();
      } catch { render(); }
    };

    cleanup();     // size değiştiğinde yeniden render gerekir
    boot();

    return () => { cancelled = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hl, theme, useCompact, siteKey]);

  if (!siteKey) {
    return (
      <div className={`recaptcha-center ${className}`} style={style}>
        <div className="px-3 py-2 rounded-md bg-[#161616] border border-[#262626]">
          <span className="text-red-400 text-sm">Missing NEXT_PUBLIC_RECAPTCHA_SITE_KEY</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`recaptcha-center ${className}`}
      style={style}
      role="group"
      aria-label="reCAPTCHA"
    >
      {/* Normal modda scale uygulanır; compact’ta scale=1 */}
      <div
        ref={shellRef}
        className="recaptcha-scale-shell"
        style={!useCompact ? { transform: `scale(${scale})`, transformOrigin: "top left" } : undefined}
      >
        <div ref={boxRef} className="g-recaptcha" />
      </div>
    </div>
  );
}
