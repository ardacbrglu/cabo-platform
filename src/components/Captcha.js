"use client";

/**
 * reCAPTCHA component (v2 checkbox or v3 invisible)
 * - v2: explicit render + theme:dark, dil değişince script yeniden yüklenir ama
 *       **mevcut geçerli token korunur** (expire olana kadar form gönderilebilir).
 * - v3: execute + 90 sn’de bir yenile.
 * - Dil değişiminde otomatik re-render; v2’de token’ı yalnızca expire/error durumunda sıfırla.
 */

import { useEffect, useRef, useState } from "react";

const MODE = (process.env.NEXT_PUBLIC_RECAPTCHA_MODE || "v2").toLowerCase(); // "v2" | "v3"
const SITE_KEY = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();

// v2 token’ları ~120s geçerli; güvenli tarafta kalalım.
const V2_TOKEN_TTL_MS = 110 * 1000;

export default function Captcha({ onChange, lang = "en", action = "form_submit", resetKey = 0 }) {
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const execRef = useRef(null);
  const renewTimerRef = useRef(null);
  const epochRef = useRef(0);

  // v2 için: son geçerli token’ı ve yaşını tut
  const lastGoodTokenRef = useRef("");
  const lastGoodTsRef = useRef(0);
  const expireTimerRef = useRef(null);

  // dış reset (örn. server hatası sonrası)
  useEffect(() => {
    try {
      if (MODE === "v2" && widgetIdRef.current != null && window.grecaptcha?.reset) {
        window.grecaptcha.reset(widgetIdRef.current);
        // v2: dış reset geldiyse token’ı temizle
        lastGoodTokenRef.current = "";
        lastGoodTsRef.current = 0;
        onChange?.("");
      } else if (MODE === "v3" && execRef.current) {
        execRef.current();
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!SITE_KEY) {
      setErr("missing-sitekey");
      return;
    }
    setErr("");

    const epoch = ++epochRef.current;

    // v3 yenileme timer’ını kapat
    if (renewTimerRef.current) {
      clearInterval(renewTimerRef.current);
      renewTimerRef.current = null;
    }
    // v2 token expire timer’ını kapat
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }

    const SCRIPT_ID = "recaptcha-script";
    const src =
      MODE === "v3"
        ? `https://www.google.com/recaptcha/api.js?hl=${encodeURIComponent(lang)}&render=${encodeURIComponent(SITE_KEY)}`
        : `https://www.google.com/recaptcha/api.js?hl=${encodeURIComponent(lang)}&onload=__caboRecaptchaOnload&render=explicit`;

    // Dil değiştiyse doğru script’i kullan (gerekirse eskiyi kaldır)
    const old = document.getElementById(SCRIPT_ID);
    if (old && old.getAttribute("src") !== src) {
      old.remove();
      try {
        delete window.grecaptcha;
      } catch {}
    }

    function ensureScript() {
      return new Promise((resolve) => {
        const exists = document.getElementById(SCRIPT_ID);
        if (exists) return resolve();
        const s = document.createElement("script");
        s.id = SCRIPT_ID;
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onerror = () => setErr("render-failed");
        document.head.appendChild(s);
        resolve();
      });
    }

    // v2 onload callback
    window.__caboRecaptchaOnload = () => {
      if (epoch !== epochRef.current) return;
      try {
        widgetIdRef.current = window.grecaptcha.render(boxRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (t) => {
            if (t) {
              lastGoodTokenRef.current = t;
              lastGoodTsRef.current = Date.now();
              onChange?.(t);
              // token’ı TTL sonunda sıfırla
              if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
              expireTimerRef.current = setTimeout(() => {
                lastGoodTokenRef.current = "";
                lastGoodTsRef.current = 0;
                onChange?.("");
              }, V2_TOKEN_TTL_MS);
            } else {
              onChange?.("");
            }
          },
          "expired-callback": () => {
            lastGoodTokenRef.current = "";
            lastGoodTsRef.current = 0;
            onChange?.("");
          },
          "error-callback": () => {
            lastGoodTokenRef.current = "";
            lastGoodTsRef.current = 0;
            onChange?.("");
          },
        });

        setErr("");

        // DİKKAT (v2): Dil değişiminde yeni widget render edilse de,
        // eğer elde hâlâ geçerli bir token varsa **temizlemiyoruz**.
        // (onChange("") çağrısı YAPMIYORUZ.)
        if (
          lastGoodTokenRef.current &&
          Date.now() - lastGoodTsRef.current < V2_TOKEN_TTL_MS
        ) {
          // Hâlâ geçerli → olduğu gibi bırak.
        } else {
          // Geçerli değilse boşalt.
          lastGoodTokenRef.current = "";
          lastGoodTsRef.current = 0;
          onChange?.("");
        }
      } catch {
        setErr("render-failed");
      }
    };

    function initV3() {
      try {
        window.grecaptcha.ready(() => {
          const exec = () =>
            window.grecaptcha
              .execute(SITE_KEY, { action })
              .then((t) => onChange?.(t || ""))
              .catch(() => onChange?.(""));
          execRef.current = exec;
          exec();
          renewTimerRef.current = setInterval(exec, 90 * 1000);
          setErr("");
        });
      } catch {
        setErr("render-failed");
      }
    }

    ensureScript().then(() => {
      if (MODE === "v3") {
        if (window.grecaptcha?.ready) initV3();
      } else if (window.grecaptcha?.render) {
        window.__caboRecaptchaOnload();
      }
    });

    return () => {
      if (renewTimerRef.current) {
        clearInterval(renewTimerRef.current);
        renewTimerRef.current = null;
      }
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
        expireTimerRef.current = null;
      }
      try {
        if (MODE === "v2" && widgetIdRef.current != null && window.grecaptcha?.reset) {
          window.grecaptcha.reset(widgetIdRef.current);
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, action]);

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
        reCAPTCHA failed to render. Check site key type &amp; allowed domains.
      </div>
    );
  }

  // Beyaz arka planı engellemek için sarmalayıcıya özel sınıf ve stil
  return MODE === "v3" ? (
    <div className="text-[12px] text-gray-500 -mt-2">Protected by reCAPTCHA.</div>
  ) : (
    <div
      ref={boxRef}
      className="cabo-recaptcha"
      // bazı temalarda parent’a arka plan atanabiliyor → garantiye al
      style={{ background: "transparent", display: "inline-block" }}
    />
  );
}
