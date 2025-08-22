"use client";

/**
 * File: src/components/Captcha.jsx
 * Purpose: reCAPTCHA (v2 checkbox or v3 invisible) with reset support
 * Security Docblock:
 * - Client sadece PUBLIC site key kullanır; secret yok.
 * - v2 için ?render=explicit, manual render; auto-render kapalı.
 * - Token loglanmaz; sadece parent'a iletilir.
 */

import { useEffect, useRef, useState } from "react";

const MODE = (process.env.NEXT_PUBLIC_RECAPTCHA_MODE || "v2").toLowerCase();
const SITE_KEY = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();

export default function Captcha({
  onChange,
  lang = "en",
  action = "form_submit",
  resetKey = 0, // değiştiğinde reset eder
}) {
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const execRef = useRef(null);
  const renewTimerRef = useRef(null);

  // reset tetikleyici
  useEffect(() => {
    if (!window.grecaptcha) return;
    try {
      if (MODE === "v2" && widgetIdRef.current != null && window.grecaptcha.reset) {
        window.grecaptcha.reset(widgetIdRef.current);
        onChange?.("");
      } else if (MODE === "v3" && execRef.current) {
        execRef.current(); // yeni token üret
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    onChange?.("");

    if (!SITE_KEY) {
      setErr("missing-sitekey");
      return;
    }

    const scriptId = "recaptcha-script";
    const qp = new URLSearchParams();
    qp.set("hl", lang);
    if (MODE === "v3") qp.set("render", SITE_KEY);
    else qp.set("render", "explicit");
    const desiredSrc = `https://www.google.com/recaptcha/api.js?${qp.toString()}`;

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
      await load();
      window.grecaptcha.ready(() => {
        if (MODE === "v3") {
          const exec = () =>
            window.grecaptcha
              .execute(SITE_KEY, { action })
              .then((t) => onChange?.(t || ""))
              .catch(() => onChange?.(""));
          execRef.current = exec;
          exec();
          renewTimerRef.current = setInterval(exec, 90 * 1000);
          return;
        }
        // v2 checkbox explicit render
        try {
          widgetIdRef.current = window.grecaptcha.render(boxRef.current, {
            sitekey: SITE_KEY,
            theme: "dark",
            callback: (t) => onChange?.(t || ""),
            "expired-callback": () => onChange?.(""),
            "error-callback": () => onChange?.(""),
          });
        } catch {
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
  }, [action, lang]);

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

  return MODE === "v3" ? (
    <div className="text-[12px] text-gray-500 -mt-2">Protected by reCAPTCHA.</div>
  ) : (
    <div ref={boxRef} />
  );
}
