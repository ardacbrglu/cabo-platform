// src/app/login/page.js
"use client";

/**
 * Affiliate Login (Credentials only) — Google disabled
 *
 * Security Docblock (Cabo PROD):
 * - No page reload on errors; inputs preserved
 * - CSRF preload; POST /api/login (JSON); client-side redirect on success
 * - Double-click safe via AbortController
 * - Accessibility: aria-live messages; focus first invalid
 * - UI: Google button disabled (grayed), explanatory label; mobile responsive
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { apiFetch } from "@/lib/apiFetch";

const translations = {
  en: {
    title: "User Login",
    infoTitle: "Start earning by sharing",
    infoDesc:
      "Share product links with your friends, followers or audience — and earn money when they make a purchase.",
    infoStrong: "Promote products, earn commission, track your stats in real-time.",
    li1: "Each product you claim generates a unique referral link",
    li2: "You get paid when people buy through your link",
    li3: "Track your clicks, sales, and earnings from your dashboard",
    li4: "Withdraw your earnings securely",
    faq: "Learn more in our ",
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
    infoTitle: "Paylaş, kazanmaya başla",
    infoDesc:
      "Ürün linklerini arkadaşlarınla, takipçilerinle ya da kitlenle paylaş — biri alışveriş yaptığında para kazanmaya başla.",
    infoStrong: "Ürünleri tanıt, komisyon kazan, istatistiklerini anlık takip et.",
    li1: "Her ürün için sana özel referans linki oluşur",
    li2: "Birileri senin linkinden alışveriş yaparsa ödeme alırsın",
    li3: "Tıklama, satış ve kazançlarını panelden takip edebilirsin",
    li4: "Kazancını güvenle çekebilirsin",
    faq: "Daha fazlası SSS'de: ",
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, ready } = useLocale();

  // locale → 'en'/'tr'
  const { t } = useMemo(() => {
    const norm =
      String(locale || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
    const dict = translations[norm] || translations.en;
    return {
      t: (key) => (dict && key in dict ? dict[key] : key),
    };
  }, [locale]);

  // redirect target
  const rawFrom = searchParams?.get("from");
  const callbackUrl = useMemo(() => {
    const f = rawFrom || "/dashboard";
    return f.startsWith("/") && !f.startsWith("//") ? f : "/dashboard";
  }, [rawFrom]);

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

  const [justActivated, setJustActivated] = useState(false);

  // hints
  const [submitted, setSubmitted] = useState(false);
  const [hintsVisible, setHintsVisible] = useState(false);
  const firstInvalidRef = useRef(null);
  const programmaticFocusRef = useRef(false);

  // inflight cancel
  const abortRef = useRef(null);
  function cancelInflight() {
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
  }

  const handleFocus = () => {
    if (!programmaticFocusRef.current) setHintsVisible(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", {
          credentials: "include",
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        if (j?.csrfToken) setCsrfToken(j.csrfToken);
      } catch {}
      setCsrfReady(true);
    })();
  }, []);

  // activated=1 banner (query temizle)
  useEffect(() => {
    if (searchParams?.get("activated") === "1") {
      setJustActivated(true);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("activated");
        window.history.replaceState({}, "", url.toString());
      } catch {}
    }
  }, [searchParams]);

  // validation
  const validate = () => {
    const errs = {};
    if (!email) errs.email = t("errorFill");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = t("errorEmailFormat");
    if (!password) errs.password = t("errorFill");
    return errs;
  };

  const errors = submitted ? validate() : {};
  const needsRef = (name) => submitted && errors[name] && !firstInvalidRef.current;

  const inputBase =
    "bg-white text-black rounded-lg px-4 py-3 border border-[#232323] focus:outline-none focus:ring-2 w-full";
  const ringOk = "focus:ring-[#81d742]";
  const ringErr = "focus:ring-red-400 border-red-500";

  async function onSubmit(e) {
    e.preventDefault();                 // ✅ tam sayfa submit’i durdur
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

        // 🔑 KRİTİK: 401/403’te otomatik redirect’i kapat
        noAuthRedirect: true,
        noRetry: true,              // (opsiyonel) backoff/retry kapat
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        router.push(callbackUrl);   // başarılıysa yönlendir
      } else {
        // 401/403/429/5xx dahil: sayfa YENİLENMEDEN mesaj göster
        setError(
          typeof data?.message === "string" && data.message
            ? data.message
            : t("serverError")
        );
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
      <div className="flex flex-col md:flex-row w-full items-center justify-center gap-12 py-10 px-4 sm:px-6 max-w-5xl mx-auto min-h-[65vh]">
        {/* LEFT INFO */}
        <div className="max-w-lg w-full mb-8 md:mb-0 flex flex-col items-center text-center mx-auto cabo-mobile-top-space cabo-mobile-bottom-space">
          <div className="mb-6">
            <h2 className="text-4xl md:text-5xl font-bold text-[#d1ffd0] mb-4">
              {t("infoTitle")}
            </h2>
            <p className="text-gray-300 text-lg mb-4">{t("infoDesc")}</p>
            <p className="text-[#81d742] font-semibold text-lg mb-6">
              {t("infoStrong")}
            </p>
            <ul
              className="text-gray-400 text-base mb-6 list-disc pl-6 text-left space-y-2 mx-auto"
              style={{ maxWidth: 340 }}
            >
              <li>{t("li1")}</li>
              <li>{t("li2")}</li>
              <li>{t("li3")}</li>
              <li>{t("li4")}</li>
            </ul>
            <div className="text-gray-400 text-sm mb-2">
              {t("faq")}
              <Link
                prefetch={false}
                href="/faq"
                className="text-[#81d742] underline hover:text-[#b3ffb3]"
              >
                {String(locale || "").toLowerCase().startsWith("tr")
                  ? "SSS"
                  : "FAQ"}
              </Link>
            </div>
          </div>
        </div>

        {/* FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">
            {t("title")}
          </h3>

          {justActivated && (
            <div
              className="text-green-400 text-base text-center mb-3"
              role="status"
              aria-live="polite"
            >
              {t("activatedBanner")}
            </div>
          )}

          {!csrfReady && (
            <div
              className="text-gray-400 text-sm text-center mb-3"
              role="status"
              aria-live="polite"
            >
              {t("csrfWait")}
            </div>
          )}

          <form onSubmit={onSubmit} className="w-full flex flex-col gap-6" noValidate>
            {/* Email */}
            <div className="relative cabo-input-surface" onFocus={handleFocus}>
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
              <button
                type="button"
                className="text-sm text-[#81d742] underline hover:text-[#b3ffb3] transition"
                onClick={() => router.push("/password_reset")}
              >
                {t("forgot")}
              </button>
            </div>

            {error && (
              <div
                className="text-red-500 text-base text-center"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !csrfReady}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
            >
              {loading ? t("loggingIn") : t("loginBtn")}
            </button>

            <div className="flex items-center my-4">
              <span className="flex-1 h-px bg-[#232323]" />
              <span className="px-3 text-gray-400 text-sm font-semibold">
                {t("or")}
              </span>
              <span className="flex-1 h-px bg-[#232323]" />
            </div>

            {/* Google disabled notice + disabled button */}
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

          <div className="mt-6 text-gray-400 text-sm">
            {t("noAccount")}{" "}
            <Link
              prefetch={false}
              href="/register"
              className="text-[#81d742] underline hover:text-[#b3ffb3]"
            >
              {t("registerHere")}
            </Link>
          </div>
        </div>
      </div>

      {/* Sadece bu sayfada: wrapper içindeki inputlar her durumda beyaz kalsın (autofill dahil) */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .cabo-mobile-top-space { margin-top: 1rem !important; }
          .cabo-mobile-bottom-space { margin-bottom: 1rem !important; }
        }
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
