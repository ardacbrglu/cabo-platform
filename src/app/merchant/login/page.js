// src/app/merchant/login/page.js
"use client";

/**
 * Merchant Login — Affiliate Login style (single centered card) ✅
 * - Affiliate login sayfasındaki premium stili birebir uygular (glow + gradient headline + kicker)
 * - Tek kart (ekstra kutu yok)
 * - CSRF preload + abort controller
 * - Locale: Navbar ile aynı kaynaktan (LocaleContext) okunur
 * - Başarılı login -> hard redirect + cache-bust (middleware yeni session cookie'yi görsün)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { apiFetch } from "@/lib/apiFetch";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";

const translations = {
  en: {
    kicker: "Secure merchant login",
    title: "Welcome back to Cabo",
    subtitle: "Sign in to manage products, stats, and payouts.",
    emailPlaceholder: "Business Email",
    passwordPlaceholder: "Password",
    loginBtn: "Log in",
    loggingIn: "Logging in...",
    errorFill: "Please enter your email and password.",
    errorEmailFormat: "Please enter a valid email address.",
    forgot: "Forgot password?",
    noAccount: "Not registered yet?",
    registerHere: "Register your business",
    serverError: "Login failed. Please try again.",
    ratelimit: "Too many requests. Please try again in a minute.",
    csrfWait: "Preparing a secure session… Please wait a moment.",
  },
  tr: {
    kicker: "Güvenli satıcı girişi",
    title: "Cabo’ya tekrar hoş geldin",
    subtitle: "Ürünlerini yönet, istatistikleri ve ödemeleri takip et.",
    emailPlaceholder: "İş E-posta",
    passwordPlaceholder: "Şifre",
    loginBtn: "Giriş Yap",
    loggingIn: "Giriş yapılıyor...",
    errorFill: "Lütfen e-posta ve şifrenizi girin.",
    errorEmailFormat: "Lütfen geçerli bir e-posta adresi girin.",
    forgot: "Şifreni mi unuttun?",
    noAccount: "Henüz kaydolmadınız mı?",
    registerHere: "İşletmeni kaydet",
    serverError: "Giriş başarısız. Lütfen tekrar deneyin.",
    ratelimit: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen bekleyin.",
  },
};

const cx = (...a) => a.filter(Boolean).join(" ");

const GradientWord = ({ children }) => (
  <span className="bg-gradient-to-r from-[#ff7b7b] via-[#ffb36b] to-[#7cf7a6] bg-clip-text text-transparent">
    {children}
  </span>
);

const Kicker = ({ children }) => (
  <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-mono tracking-wide bg-[#111] border border-[#1e1e1e] text-[#cfcfcf]">
    <Sparkles className="w-4 h-4 text-[#81d742]" />
    <span>{children}</span>
  </div>
);

export default function MerchantLoginPage() {
  const { locale, ready } = useLocale();

  const { t, lang } = useMemo(() => {
    const norm = String(locale || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
    const dict = translations[norm] || translations.en;
    return {
      lang: norm,
      t: (k) => (dict && k in dict ? dict[k] : k),
    };
  }, [locale]);

  // form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // CSRF preload
  const [csrfToken, setCsrfToken] = useState("");
  const [csrfReady, setCsrfReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (alive && j?.csrfToken) setCsrfToken(j.csrfToken);
      } catch {}
      if (alive) setCsrfReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // hints
  const [submitted, setSubmitted] = useState(false);
  const [hintsVisible, setHintsVisible] = useState(false);
  const firstInvalidRef = useRef(null);
  const programmaticFocusRef = useRef(false);
  const handleFocus = () => {
    if (!programmaticFocusRef.current) setHintsVisible(false);
  };

  // inflight cancel
  const abortRef = useRef(null);
  function cancelInflight() {
    try {
      abortRef.current?.abort();
    } catch {}
    abortRef.current = null;
  }
  useEffect(() => () => cancelInflight(), []);

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

  const inputBase = useMemo(() => {
    return (
      "w-full rounded-xl px-4 py-3 text-[14px] " +
      "bg-[#111] text-white placeholder-gray-500 " +
      "border border-[#242424] " +
      "focus:outline-none focus:ring-2 focus:ring-[#81d742] focus:border-[#81d742] " +
      "autofill:shadow-[inset_0_0_0_1000px_#111]"
    );
  }, []);

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
        setTimeout(() => {
          programmaticFocusRef.current = false;
          setHintsVisible(true);
        }, 80);
      });
      return;
    }

    if (!csrfReady) {
      setError(t("csrfWait"));
      return;
    }

    cancelInflight();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await apiFetch("/api/merchant_login", {
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

      if (res.status === 429) {
        setError(t("ratelimit"));
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        // hard redirect + cache-bust
        const next = new URL("/merchant/dashboard", window.location.origin);
        next.searchParams.set("t", String(Date.now()));
        window.location.assign(next.toString());
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

  return (
    <PublicLayout>
      {!ready ? null : (
        <main className="relative w-full">
          <div className="relative z-0 w-full flex items-center justify-center min-h-[calc(100svh-var(--public-header-h)-var(--public-footer-h))] md:min-h-[calc(100dvb-var(--public-header-h)-var(--public-footer-h))] py-10 px-4">
            {/* ✅ same soft glow backdrop as affiliate login */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="absolute -inset-24 blur-3xl opacity-25 bg-gradient-to-br from-[#81d742] via-[#ff8a6b] to-[#6be0ff]" />
            </div>

            <div className="relative w-full max-w-md rounded-2xl border border-[#232323] bg-[#0f0f0f] shadow-[0_18px_60px_rgba(0,0,0,.55)] px-6 sm:px-8 py-8">
              <div className="text-center">
                <Kicker>{t("kicker")}</Kicker>

                <h1 className="mt-4 text-3xl font-extrabold text-[#d1ffd0]">
                  {t("title").includes("Cabo") ? (
                    <>
                      {t("title").split("Cabo")[0]}
                      <GradientWord>Cabo</GradientWord>
                      {t("title").split("Cabo").slice(1).join("Cabo")}
                    </>
                  ) : (
                    t("title")
                  )}
                </h1>

                <p className="mt-2 text-[13px] text-gray-400">{t("subtitle")}</p>
              </div>

              {!csrfReady && (
                <div className="mt-3 text-gray-400 text-sm text-center" role="status" aria-live="polite">
                  {t("csrfWait")}
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-6 w-full flex flex-col gap-5" noValidate>
                {/* Email */}
                <div className="relative" onFocus={handleFocus}>
                  <label className="sr-only" htmlFor="email">{t("emailPlaceholder")}</label>
                  <input
                    ref={(el) => {
                      if (needsRef("email")) firstInvalidRef.current = el;
                    }}
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
                    className={cx(inputBase, errors.email ? "border-red-500 focus:ring-red-400" : "")}
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
                <div className="relative" onFocus={handleFocus}>
                  <label className="sr-only" htmlFor="password">{t("passwordPlaceholder")}</label>
                  <input
                    ref={(el) => {
                      if (needsRef("password")) firstInvalidRef.current = el;
                    }}
                    id="password"
                    type="password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    autoCapitalize="off"
                    spellCheck="false"
                    className={cx(inputBase, errors.password ? "border-red-500 focus:ring-red-400" : "")}
                    required
                    aria-invalid={!!errors.password}
                  />
                  {submitted && errors.password && hintsVisible && (
                    <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between -mt-1">
                  <Link
                    href="/password_reset"
                    prefetch={false}
                    className="text-sm text-[#81d742] underline hover:text-[#b3ffb3] transition"
                  >
                    {t("forgot")}
                  </Link>
                </div>

                {error && (
                  <div className="text-red-400 text-sm text-center" role="alert" aria-live="assertive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !csrfReady}
                  className={cx(
                    "w-full px-6 py-3 text-[15px] font-bold rounded-xl transition",
                    "bg-[#81d742] text-[#0b0b0b] hover:bg-[#baff7c]",
                    "disabled:opacity-60 active:scale-[0.99]",
                    "focus:outline-none focus:ring-2 focus:ring-[#a2ff70] focus:ring-offset-2 focus:ring-offset-[#0b0b0b]"
                  )}
                  style={{ boxShadow: "0 10px 40px rgba(129,215,66,.12)" }}
                >
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={18} /> {t("loggingIn")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2">
                      {t("loginBtn")} <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </button>

                <div className="pt-1 text-gray-400 text-sm text-center">
                  {t("noAccount")}{" "}
                  <Link
                    href="/merchant/register"
                    prefetch={false}
                    className="text-[#81d742] underline hover:text-[#b3ffb3]"
                  >
                    {t("registerHere")}
                  </Link>
                </div>
              </form>
            </div>
          </div>

          {/* Dark autofill fix (mavi görünümü engelle) */}
          <style jsx global>{`
            input:-webkit-autofill,
            input:-webkit-autofill:hover,
            input:-webkit-autofill:focus {
              -webkit-text-fill-color: #ffffff !important;
              caret-color: #ffffff;
              -webkit-box-shadow: 0 0 0 1000px #111 inset !important;
                      box-shadow: 0 0 0 1000px #111 inset !important;
              transition: background-color 9999s ease-in-out 0s;
            }
          `}</style>
        </main>
      )}
    </PublicLayout>
  );
}
