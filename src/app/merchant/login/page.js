"use client";

/**
 * Security Docblock — Cabo PROD
 * Page: /merchant/login
 * - SPA submit via apiFetch (credentials: include, X-Requested-With, X-Request-Id)
 * - NextAuth CSRF preload (read-only)
 * - Minimal UI; PublicLayout ile sarılır
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { apiFetch } from "@/lib/apiFetch";

const translations = {
  en: {
    title: "Merchant Login",
    emailPlaceholder: "Business Email",
    passwordPlaceholder: "Password",
    loginBtn: "Log in",
    loggingIn: "Logging in...",
    forgot: "Forgot password?",
    noAccount: "Not registered yet?",
    registerHere: "Register your business",
    errorFill: "Please enter your email and password.",
    errorEmailFormat: "Please enter a valid email address.",
    serverError: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please try again in a minute.",
    csrfWait: "Preparing a secure session… Please wait a moment.",
  },
  tr: {
    title: "Satıcı Girişi",
    emailPlaceholder: "İş E-posta",
    passwordPlaceholder: "Şifre",
    loginBtn: "Giriş Yap",
    loggingIn: "Giriş yapılıyor...",
    forgot: "Şifreni mi unuttun?",
    noAccount: "Henüz kaydolmadınız mı?",
    registerHere: "İşletmeni kaydet",
    errorFill: "Lütfen e-posta ve şifrenizi girin.",
    errorEmailFormat: "Lütfen geçerli bir e-posta adresi girin.",
    serverError: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen bekleyin.",
  },
};

export default function MerchantLoginPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();
  const lang = (locale || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
  const t = useMemo(() => (k) => translations[lang]?.[k] ?? k, [lang]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const firstInvalidRef = useRef(null);
  const programmaticFocusRef = useRef(false);
  const [hintsVisible, setHintsVisible] = useState(false);
  const handleFocus = () => { if (!programmaticFocusRef.current) setHintsVisible(false); };

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

  if (!ready) return null;

  const validate = () => {
    const errs = {};
    if (!email || !password) errs.fill = t("errorFill");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t("errorEmailFormat");
    return errs;
  };
  const errors = submitted ? validate() : {};
  const needsRef = (name) => submitted && errors[name] && !firstInvalidRef.current;

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setSubmitted(true);
    setServerError("");
    firstInvalidRef.current = null;

    const errs = validate();
    if (Object.keys(errs).length) {
      programmaticFocusRef.current = true;
      requestAnimationFrame(() => {
        (needsRef("email") ? document.getElementById("email") : document.getElementById("password"))?.focus?.();
        setTimeout(() => { programmaticFocusRef.current = false; setHintsVisible(true); }, 80);
      });
      return;
    }
    if (!csrfReady) { setServerError(t("csrfWait")); return; }

    setLoading(true);
    try {
      const res = await apiFetch("/api/merchant_login", {
        method: "POST",
        headers: { ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), "accept-language": lang },
        body: { email: email.trim().toLowerCase(), password },
        noAuthRedirect: true,
      });

      if (res.status === 429) { setServerError(t("ratelimit")); setLoading(false); return; }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.message || t("serverError"));
        return;
      }
      router.push("/merchant/dashboard");
    } catch {
      setServerError(t("serverError"));
    } finally {
      setLoading(false);
    }
  }

  const inputBase =
    "cabo-input bg-white text-black rounded-lg px-4 py-3 border border-[#232323] focus:outline-none focus:ring-2 w-full";
  const ringOk = "focus:ring-[#81d742]";
  const ringErr = "focus:ring-red-400 border-red-500";

  return (
    <PublicLayout>
      <div className="relative z-0 w-full flex items-center justify-center min-h-[calc(100svh-var(--public-header-h)-var(--public-footer-h))] md:min-h-[calc(100dvb-var(--public-header-h)-var(--public-footer-h))] py-8 md:py-12 px-4">
        <div className="bg-[#1a1a1a] border border-[#232323] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4 text-center">{t("title")}</h3>

          {!csrfReady && (
            <div className="text-gray-400 text-sm text-center mb-3" role="status" aria-live="polite">
              {t("csrfWait")}
            </div>
          )}

          <form onSubmit={onSubmit} className="w-full flex flex-col gap-6" noValidate>
            {/* Email */}
            <div className="relative" onFocus={handleFocus}>
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
                required
                aria-invalid={!!errors.email || !!errors.fill}
                className={`${inputBase} ${errors.email || errors.fill ? ringErr : ringOk}`}
              />
              {submitted && (errors.email || errors.fill) && hintsVisible && (
                <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                  {errors.email || errors.fill}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="relative" onFocus={handleFocus}>
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
                required
                aria-invalid={!!errors.fill}
                className={`${inputBase} ${errors.fill ? ringErr : ringOk}`}
              />
              {submitted && errors.fill && hintsVisible && (
                <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                  {errors.fill}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between -mt-2">
              <Link href="/password_reset" prefetch={false} className="text-sm text-[#81d742] underline hover:text-[#b3ffb3] transition">
                {t("forgot")}
              </Link>
            </div>

            {serverError && (
              <div className="text-red-500 text-base text-center" role="alert" aria-live="polite">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !csrfReady}
              className="w-full bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
            >
              {loading ? t("loggingIn") : t("loginBtn")}
            </button>

            <div className="mt-4 text-gray-400 text-sm text-center">
              {t("noAccount")}{" "}
              <Link href="/merchant/register" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {t("registerHere")}
              </Link>
            </div>
          </form>
        </div>
      </div>

      <style jsx global>{`
        .cabo-input { -webkit-appearance: none; appearance: none; }
        .cabo-input:focus { outline: none !important; box-shadow: none !important; }

        input.cabo-input:-webkit-autofill,
        input.cabo-input:-webkit-autofill:hover,
        input.cabo-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #0b0b0b !important;
          caret-color: #0b0b0b;
          -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
                  box-shadow: 0 0 0 1000px #ffffff inset !important;
        }
        input.cabo-input:-moz-autofill {
          background: #ffffff !important;
          color: #0b0b0b !important;
        }
      `}</style>
    </PublicLayout>
  );
}
