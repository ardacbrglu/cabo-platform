"use client";

import { useEffect, useRef, useState } from "react";

/**
 * reCAPTCHA v2 Checkbox (native)
 * - Doğal widget (Google CSS'i), tema: light/dark
 * - Otomatik script fallback: google.com → recaptcha.net
 * - Enterprise fallback: normal render başarısızsa enterprise.js dener
 * - onChange(token) + dış reset (resetKey)
 */

const SITE_KEY = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
const TOKEN_TTL_MS = 110 * 1000;

const STD = [
  "https://www.google.com/recaptcha/api.js",
  "https://www.recaptcha.net/recaptcha/api.js",
];
const ENT = [
  "https://www.google.com/recaptcha/enterprise.js",
  "https://www.recaptcha.net/recaptcha/enterprise.js",
];

export default function Captcha({
  onChange,
  lang = "tr",
  resetKey = 0,
  theme = "light",      // modern sitelerde beyaz kutu daha problemsiz
  className = "",
  style,
}) {
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const expireTimerRef = useRef(null);
  const epochRef = useRef(0);

  // dış reset
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
    cleanup();

    const onloadName = "__caboRecaptchaOnload";

    const tryRender = (useEnterprise = false) => {
      const gre = useEnterprise
        ? window.grecaptcha?.enterprise
        : window.grecaptcha;

      if (!gre?.render) throw new Error("no-render");

      widgetIdRef.current = gre.render(boxRef.current, {
        sitekey: SITE_KEY,
        theme: theme === "dark" ? "dark" : "light",
        callback: (t) => {
          onChange?.(t || "");
          if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
          expireTimerRef.current = setTimeout(() => onChange?.(""), TOKEN_TTL_MS);
        },
        "expired-callback": () => { onChange?.(""); },
        "error-callback": () => { onChange?.(""); },
      });
      setErr("");
    };

    const loadScript = (src, id) =>
      new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.id = id;
        el.src = `${src}?render=explicit&hl=${encodeURIComponent(lang)}&onload=${onloadName}`;
        el.async = true; el.defer = true;
        el.onerror = () => reject(new Error("script-error"));
        document.head.appendChild(el);
        // 8sn korumalı timeout
        const to = setTimeout(() => reject(new Error("script-timeout")), 8000);
        window[onloadName] = () => { clearTimeout(to); resolve(); };
      });

    const boot = async () => {
      try {
        // 1) normal script (google → recaptcha.net fallback)
        try { await loadScript(STD[0], "recaptcha-v2-script"); }
        catch  { await loadScript(STD[1], "recaptcha-v2-script"); }

        // 2) normal render dene
        try { tryRender(false); return; }
        catch { /* enterprise deneyelim */ }

        // 3) enterprise script (google → recaptcha.net)
        removeScript("recaptcha-v2-script");
        try { await loadScript(ENT[0], "recaptcha-enterprise-script"); }
        catch  { await loadScript(ENT[1], "recaptcha-enterprise-script"); }

        // 4) enterprise render
        tryRender(true);
      } catch {
        setErr("render-failed");
      }
    };

    boot();

    return cleanup;

    function removeScript(id) {
      const ex = document.getElementById(id);
      if (ex) ex.remove();
    }
    function cleanup() {
      if (expireTimerRef.current) { clearTimeout(expireTimerRef.current); expireTimerRef.current = null; }
      try {
        widgetIdRef.current = null;
        if (boxRef.current) boxRef.current.innerHTML = "";
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, theme, onChange]);

  const errorMsg =
    err === "missing-sitekey"
      ? "reCAPTCHA misconfigured: missing NEXT_PUBLIC_RECAPTCHA_SITE_KEY."
      : err === "render-failed"
      ? "reCAPTCHA failed to render. Check site key type & allowed domains."
      : "";

  return (
    <div className={className} style={style} aria-label="reCAPTCHA" role="group">
      {errorMsg ? <div className="text-[12px] text-gray-400">reCAPTCHA</div> : <div ref={boxRef} className="g-recaptcha" />}
      {errorMsg && <div className="mt-2 text-red-400 text-sm">{errorMsg}</div>}
    </div>
  );
}
