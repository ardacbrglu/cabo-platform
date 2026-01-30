"use client";

/**
 * Login — Homepage style (single centered card) ✅
 * - Register sayfasındaki premium stili aynen uygular (glow + gradient headline + kicker)
 * - Tek kart: ekstra sağ info kutusu yok
 * - CSRF preload + abort controller + open-redirect whitelist korunur
 * - Hooks order güvenli (erken return yok; ready gating JSX içinde)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { apiFetch } from "@/lib/apiFetch";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";

const translations = {
  en: {
    kicker: "Secure login",
    title: "Welcome back to Cabo",
    subtitle: "Sign in to manage links, track performance, and payouts.",
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
    kicker: "Güvenli giriş",
    title: "Cabo’ya tekrar hoş geldin",
    subtitle: "Linklerini yönet, performansı ve ödemeleri takip et.",
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
    activatedBanner: "Hesabın aktifleştirildi! Şimdi giriş yapabilirsin.",
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

export default function LoginPage() {
  const { locale, ready } = useLocale();

  const { t, isTR } = useMemo(() => {
    const norm = String(locale || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
    const dict = translations[norm] || translations.en;
    return {
      isTR: norm === "tr",
      t: (k) => (dict && k in dict ? dict[k] : k),
    };
  }, [locale]);

  // redirect target (?from=...) + activated banner
  const callbackUrlRef = useRef("/dashboard");
  const [justActivated, setJustActivated] = useState(false);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const f = url.searchParams.get("from");

      // Only allow redirects to a controlled set of internal paths
      const allowedRedirects = ["/dashboard", "/profile", "/settings"];
      if (f && f.startsWith("/") && !f.startsWith("//") && allowedRedirects.includes(f)) {
        callbackUrlRef.current = f;
      }

      if (url.searchParams.get("activated") === "1") {
        setJustActivated(true);
        url.searchParams.delete("activated");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
  }, []);

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

  useEffect(() => {
    return () => cancelInflight();
  }, []);

  // Optional: suppress noisy “Timeout” unhandled rejections (3rd party scripts)
  useEffect(() => {
    const onUnhandled = (event) => {
      const reason = event?.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason?.message
          ? String(reason.message)
          : "";
      if (msg && msg.toLowerCase().includes("timeout")) {
        event.preventDefault?.();
        console.warn("[login] Suppressed unhandled rejection (Timeout):", reason);
      }
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, []);

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
        setError(
          typeof data?.message === "string" && data.message ? data.message : t("serverError")
        );
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
            {/* soft glow backdrop */}
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

              {justActivated && (
                <div className="mt-5 text-green-400 text-sm text-center" role="status" aria-live="polite">
                  {t("activatedBanner")}
                </div>
              )}
              {!csrfReady && (
                <div className="mt-3 text-gray-400 text-sm text-center" role="status" aria-live="polite">
                  {t("csrfWait")}
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-6 w-full flex flex-col gap-5" noValidate>
                {/* Email */}
                <div className="relative" onFocus={handleFocus}>
                  <label className="sr-only" htmlFor="email">
                    {t("emailPlaceholder")}
                  </label>
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
                  <label className="sr-only" htmlFor="password">
                    {t("passwordPlaceholder")}
                  </label>
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
                    className={cx(
                      inputBase,
                      errors.password ? "border-red-500 focus:ring-red-400" : ""
                    )}
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

                <div className="flex items-center my-1">
                  <span className="flex-1 h-px bg-[#232323]" />
                  <span className="px-3 text-gray-500 text-xs font-semibold">{t("or")}</span>
                  <span className="flex-1 h-px bg-[#232323]" />
                </div>

                <div className="w-full -mt-1 -mb-1 text-center text-xs text-gray-500 italic select-none">
                  {t("googleSoon")}
                </div>

                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="flex items-center justify-center gap-2 bg-[#101010] text-[#6e6e6e] font-bold py-3 rounded-xl border border-[#232323] w-full cursor-not-allowed select-none"
                  title={t("googleSoon")}
                >
                  <span className="w-6 h-6 mr-1 inline-block align-middle opacity-70" aria-hidden="true">
                    <img src="/google.svg" width="24" height="24" alt="" />
                  </span>
                  {t("googleBtn")}
                </button>

                <div className="pt-1 text-gray-400 text-sm text-center">
                  {t("noAccount")}{" "}
                  <Link href="/register" prefetch={false} className="text-[#81d742] underline hover:text-[#b3ffb3]">
                    {t("registerHere")}
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </main>
      )}
    </PublicLayout>
  );
}
