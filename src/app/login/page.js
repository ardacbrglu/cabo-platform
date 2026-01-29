"use client";

/**
 * Login — centered, single card
 * - PublicLayout ana <main> kullanılır (ekstra main yok)
 * - Kart: max-w-md, buton full width
 * - İç sarma: z-0 (header overlay her zaman üste gelsin)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { apiFetch } from "@/lib/apiFetch";

const translations = {
  en: {
    title: "User Login",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    loginBtn: "Log in",
    loggingIn: "Logging in...",
    errorFill: "Please enter your email and password.",
    errorEmailFormat: "Please enter a valid email address.",
    forgot: "Forgot password?",
    noAccount: "Don’t have an account?",
    registerHere: "Register here",
    or: "or",
    googleBtn: "Sign in with Google",
    googleSoon: "Google sign-in — coming soon",
    serverError: "Server error. Please try again later.",
    activatedBanner: "Your account has been activated! You can now log in.",
    csrfWait: "Preparing a secure session… Please wait a moment.",
  },
  tr: {
    title: "Kullanıcı Girişi",
    emailPlaceholder: "E-posta",
    passwordPlaceholder: "Şifre",
    loginBtn: "Giriş Yap",
    loggingIn: "Giriş yapılıyor...",
    errorFill: "Lütfen e-posta ve şifrenizi girin.",
    errorEmailFormat: "Lütfen geçerli bir e-posta adresi girin.",
    forgot: "Şifreni mi unuttun?",
    noAccount: "Hesabın yok mu?",
    registerHere: "Buradan kaydol",
    or: "veya",
    googleBtn: "Google ile giriş yap",
    googleSoon: "Google ile giriş — yakında",
    serverError: "Sunucu hatası. Lütfen tekrar deneyin.",
    activatedBanner: "Hesabınız aktifleştirildi! Şimdi giriş yapabilirsiniz.",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen bekleyin.",
  },
};

export default function LoginPage() {
  const { locale, ready } = useLocale();

  // i18n
  const { t } = useMemo(() => {
    const norm = String(locale || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
    const dict = translations[norm] || translations.en;
    return { t: (k) => (dict && k in dict ? dict[k] : k) };
  }, [locale]);

  // redirect target (?from=...) ve activated banner
  const callbackUrlRef = useRef("/dashboard");
  const [justActivated, setJustActivated] = useState(false);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const f = url.searchParams.get("from");
      // Only allow redirects to a controlled set of internal paths
      const allowedRedirects = ["/dashboard", "/profile", "/settings"];
      if (
        f &&
        f.startsWith("/") &&
        !f.startsWith("//") &&
        allowedRedirects.includes(f)
      ) {
        callbackUrlRef.current = f;
      }
      if (url.searchParams.get("activated") === "1") {
        setJustActivated(true);
        url.searchParams.delete("activated");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
  }, []);

  // mount flag
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // CSRF preload
  const [csrfToken, setCsrfToken] = useState("");
  const [csrfReady, setCsrfReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (j?.csrfToken) setCsrfToken(j.csrfToken);
      } catch {}
      setCsrfReady(true);
    })();
  }, []);

  // hints
  const [submitted, setSubmitted] = useState(false);
  const [hintsVisible, setHintsVisible] = useState(false);
  const firstInvalidRef = useRef(null);
  const programmaticFocusRef = useRef(false);
  const handleFocus = () => { if (!programmaticFocusRef.current) setHintsVisible(false); };

  // inflight cancel
  const abortRef = useRef(null);
  function cancelInflight() { try { abortRef.current?.abort(); } catch {} abortRef.current = null; }

  // validation
  const validate = () => {
    const errs = {};
    if (!email) errs.email = t("errorFill");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t("errorEmailFormat");
    if (!password) errs.password = t("errorFill");
    return errs;
  };
  const errors = submitted ? validate() : {};
  const needsRef = (name) => submitted && errors[name] && !firstInvalidRef.current;

  // inputs
  const inputBase =
    "bg-white text-black rounded-lg px-4 py-3 border border-[#232323] focus:outline-none focus:ring-2 w-full";
  const ringOk = "focus:ring-[#81d742]";
  const ringErr = "focus:ring-red-400 border-red-500";

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setSubmitted(true);
    setError("");
    firstInvalidRef.current = null;

    const errs = validate();
    if (Object.keys(errs).length) {
      programmaticFocusRef.current = true;
      requestAnimationFrame(() => {
        firstInvalidRef.current?.focus?.();
        setTimeout(() => { programmaticFocusRef.current = false; setHintsVisible(true); }, 80);
      });
      return;
    }
    if (!csrfReady) { setError(t("csrfWait")); return; }

    cancelInflight();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await apiFetch("/api/login", {
        method: "POST",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          "accept-language": String(locale || "en"),
        },
        body: { email: email.trim().toLowerCase(), password },
        signal: ac.signal,
        noAuthRedirect: true,
        noRetry: true,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        window.location.href = callbackUrlRef.current;
      } else {
        setError(typeof data?.message === "string" && data.message ? data.message : t("serverError"));
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError(t("serverError"));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  if (!mounted || !ready) return null;

  return (
    <PublicLayout>
      {/* DİKEY ORTALAMA — ekstra <main> yok; z-0: header overlay daima üste */}
      <div className="relative z-0 w-full flex items-center justify-center min-h-[calc(100svh-var(--public-header-h)-var(--public-footer-h))] md:min-h-[calc(100dvb-var(--public-header-h)-var(--public-footer-h))] py-8 md:py-12 px-4">
        <div className="bg-[#1a1a1a] border border-[#232323] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4 text-center">{t("title")}</h3>

          {justActivated && (
            <div className="text-green-400 text-base text-center mb-3" role="status" aria-live="polite">
              {t("activatedBanner")}
            </div>
          )}
          {!csrfReady && (
            <div className="text-gray-400 text-sm text-center mb-3" role="status" aria-live="polite">
              {t("csrfWait")}
            </div>
          )}

          <form onSubmit={onSubmit} className="w-full flex flex-col gap-6" noValidate>
            {/* Email */}
            <div className="relative cabo-input-surface" onFocus={handleFocus}>
              <label className="sr-only" htmlFor="email">{t("emailPlaceholder")}</label>
              <input
                ref={(el) => { if (needsRef("email")) firstInvalidRef.current = el; }}
                id="email"
                type="email"
                inputMode="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="username"
                autoCapitalize="off"
                spellCheck="false"
                className={`${inputBase} ${errors.email ? ringErr : ringOk}`}
                required
                aria-invalid={!!errors.email}
              />
              {submitted && errors.email && hintsVisible && (
                <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="relative cabo-input-surface" onFocus={handleFocus}>
              <label className="sr-only" htmlFor="password">{t("passwordPlaceholder")}</label>
              <input
                ref={(el) => { if (needsRef("password")) firstInvalidRef.current = el; }}
                id="password"
                type="password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                autoCapitalize="off"
                spellCheck="false"
                className={`${inputBase} ${errors.password ? ringErr : ringOk}`}
                required
                aria-invalid={!!errors.password}
              />
              {submitted && errors.password && hintsVisible && (
                <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                  {errors.password}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between -mt-2">
              <Link href="/password_reset" prefetch={false} className="text-sm text-[#81d742] underline hover:text-[#b3ffb3] transition">
                {t("forgot")}
              </Link>
            </div>

            {error && (
              <div className="text-red-500 text-base text-center" role="alert" aria-live="assertive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !csrfReady}
              className="w-full bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
            >
              {loading ? t("loggingIn") : t("loginBtn")}
            </button>

            <div className="flex items-center my-4">
              <span className="flex-1 h-px bg-[#232323]" />
              <span className="px-3 text-gray-400 text-sm font-semibold">{t("or")}</span>
              <span className="flex-1 h-px bg-[#232323]" />
            </div>

            <div className="w-full -mt-1 -mb-1 text-center text-xs text-gray-400 italic select-none">
              {t("googleSoon")}
            </div>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex items-center justify-center gap-2 bg-[#eceff3] text-[#8a8f98] font-bold py-3 rounded-lg border border-[#d7dbe0] shadow-none w-full cursor-not-allowed select-none"
            >
              <span className="w-6 h-6 mr-1 inline-block align-middle opacity-60" aria-hidden="true">
                <img src="/google.svg" width="24" height="24" alt="" />
              </span>
              {t("googleBtn")}
            </button>
          </form>

          <div className="mt-6 text-gray-400 text-sm text-center">
            {t("noAccount")}{" "}
            <Link href="/register" prefetch={false} className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t("registerHere")}
            </Link>
          </div>
        </div>
      </div>

      {/* Beyaz yüzey (autofill dâhil) */}
      <style jsx global>{`
        .cabo-input-surface input {
          background: #fff !important;
          color: #000 !important;
        }
        .cabo-input-surface input:focus {
          background: #fff !important;
          color: #000 !important;
        }
        .cabo-input-surface input:-webkit-autofill,
        .cabo-input-surface input:-webkit-autofill:hover,
        .cabo-input-surface input:-webkit-autofill:focus {
          -webkit-text-fill-color: #000 !important;
          caret-color: #111;
          -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
                  box-shadow: 0 0 0 1000px #fff inset !important;
        }
        .cabo-input-surface input:-moz-autofill {
          background: #fff !important;
          color: #000 !important;
        }
      `}</style>
    </PublicLayout>
  );
}
