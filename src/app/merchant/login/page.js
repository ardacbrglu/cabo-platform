"use client";

/**
 * Merchant Login — SPA, reload yok; hatada alanlar korunur.
 * Güvenlik: Origin/AJAX/Request-Id, NextAuth CSRF preload, rate-limit.
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
    infoTitle: "Grow your business",
    infoDesc:
      "List your product, set your commission, and let affiliates drive sales for you.",
    infoStrong: "Promote products, increase sales, manage payouts easily.",
    li1: "Unique referral links per product",
    li2: "Track affiliate clicks & sales in real-time",
    li3: "Manage commissions, payouts, performance",
    li4: "Easy webhook integration & analytics",
    faq: "Learn more about merchant features in our ",
    emailPlaceholder: "Business Email",
    passwordPlaceholder: "Password",
    loginBtn: "Log in",
    loggingIn: "Logging in...",
    forgot: "Forgot password?",
    forgotSoon: "Password reset coming soon!",
    noAccount: "Not registered yet?",
    registerHere: "Register your business",
    howWorksQ: "How does our system work?",
    howWorksLink: "See Details",
    req_email: "Please fill out this field.",
    req_password: "Please fill out this field.",
    invalidEmail: "Invalid email address.",
    failed: "Login failed.",
    ratelimit: "Too many requests. Please try again in a minute.",
    csrfWait: "Preparing a secure session… Please wait a moment.",
  },
  tr: {
    title: "Satıcı Girişi",
    infoTitle: "İşletmeni Cabo ile büyüt",
    infoDesc:
      "Ürününüzü ekleyin, komisyonu belirleyin, kullanıcılar sizin için satışlar getirsin.",
    infoStrong: "Ürün tanıtın, satışları artırın, ödemeleri kolayca yönetin.",
    li1: "Her ürün için benzersiz referans linki",
    li2: "Affiliate yönlendirmelerini ve satışları anlık izleyin",
    li3: "Komisyon, ödeme ve performans yönetimi",
    li4: "Webhook ile entegrasyon, gelişmiş analiz",
    faq: "Satıcı özellikleri hakkında SSS'den bilgi alın. ",
    emailPlaceholder: "İş E-posta",
    passwordPlaceholder: "Şifre",
    loginBtn: "Giriş Yap",
    loggingIn: "Giriş yapılıyor...",
    forgot: "Şifreni mi unuttun?",
    forgotSoon: "Şifre sıfırlama yakında!",
    noAccount: "Henüz kaydolmadınız mı?",
    registerHere: "İşletmeni kaydet",
    howWorksQ: "Sistemimiz nasıl çalışır?",
    howWorksLink: "Detaylı Bilgi",
    req_email: "Lütfen bu alanı doldurun.",
    req_password: "Lütfen bu alanı doldurun.",
    invalidEmail: "Geçersiz e-posta.",
    failed: "Giriş başarısız.",
    ratelimit: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin.",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen bekleyin.",
  },
};

export default function MerchantLoginPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();
  const lang = locale === "tr" ? "tr" : "en";
  const t = useMemo(() => (k) => translations[lang]?.[k] ?? k, [lang]);

  // form state (hatalarda temizlenmez)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  // client-side validation
  const [submitted, setSubmitted] = useState(false);
  const firstInvalidRef = useRef(null);
  const programmaticFocusRef = useRef(false);
  const [hintsVisible, setHintsVisible] = useState(false);

  // NextAuth CSRF preload (opsiyonel ama ekliyoruz)
  const [csrfToken, setCsrfToken] = useState("");
  const [csrfReady, setCsrfReady] = useState(false);

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

  // modal scroll lock
  useEffect(() => {
    document.body.style.overflow = showForgot ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showForgot]);

  useEffect(() => {
    if (!hintsVisible) return;
    const close = () => setHintsVisible(false);
    window.addEventListener("pointerdown", close, { once: true });
    window.addEventListener("keydown", close, { once: true });
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [hintsVisible]);

  if (!ready) return null;

  const validate = () => {
    const errs = {};
    if (!email) errs.email = t("req_email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t("invalidEmail");
    if (!password) errs.password = t("req_password");
    return errs;
  };
  const errors = submitted ? validate() : {};
  const needsRef = (name) => submitted && errors[name] && !firstInvalidRef.current;
  const handleFocus = () => {
    if (!programmaticFocusRef.current) setHintsVisible(false);
  };

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
        firstInvalidRef.current?.focus?.();
        setTimeout(() => {
          programmaticFocusRef.current = false;
          setHintsVisible(true);
        }, 80);
      });
      return;
    }
    if (!csrfReady) {
      setServerError(t("csrfWait"));
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/merchant_login", {
        method: "POST",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          "accept-language": lang,
        },
        body: { email: email.trim().toLowerCase(), password },
        noAuthRedirect: true, // 401'de reload yapma
      });

      if (res.status === 429) {
        setServerError(t("ratelimit"));
        setLoading(false);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.message || t("failed"));
        // NOT: Şifreyi temizlemiyoruz; kullanıcı kaldığı yerden düzeltebilir.
        return;
      }

      // success → dashboard
      router.push("/merchant/dashboard");
    } catch {
      setServerError(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  const inputBase =
    "bg-white text-black rounded-lg px-4 py-3 border border-[#232323] focus:outline-none focus:ring-2 w-full";
  const ringOk = "focus:ring-[#81d742]";
  const ringErr = "focus:ring-red-400 border-red-500";

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
                href="/faq"
                className="text-[#81d742] underline hover:text-[#b3ffb3]"
              >
                {lang === "tr" ? "SSS" : "FAQ"}
              </Link>
            </div>
            <div className="text[#81d742] mt-4 text-base font-semibold">
              {t("howWorksQ")}{" "}
              <Link
                href="/merchant/info"
                className="underline hover:text-[#b3ffb3] transition"
              >
                {t("howWorksLink")}
              </Link>
            </div>
          </div>
        </div>

        {/* LOGIN FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">{t("title")}</h3>

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
                required
                aria-invalid={!!errors.email}
                className={`${inputBase} ${errors.email ? ringErr : ringOk}`}
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
                required
                aria-invalid={!!errors.password}
                className={`${inputBase} ${errors.password ? ringErr : ringOk}`}
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
                onClick={() => setShowForgot(true)}
              >
                {t("forgot")}
              </button>
            </div>

            {serverError && (
              <div className="text-red-500 text-base text-center" role="alert" aria-live="polite">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !csrfReady}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
            >
              {loading ? t("loggingIn") : t("loginBtn")}
            </button>

            <div className="mt-4 text-gray-400 text-sm text-center">
              {t("noAccount")}{" "}
              <Link
                href="/merchant/register"
                className="text-[#81d742] underline hover:text-[#b3ffb3]"
              >
                {t("registerHere")}
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal (placeholder) */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#181818] rounded-xl shadow-xl p-8 max-w-sm w-full border border-[#232323] text-center">
            <h4 className="text-lg md:text-xl text-[#d1ffd0] font-bold mb-4">
              {t("forgot")}
            </h4>
            <div className="text-gray-300 text-base mb-6">{t("forgotSoon")}</div>
            <button
              onClick={() => setShowForgot(false)}
              className="mt-2 px-6 py-3 rounded-lg bg-[#81d742] text-[#111] font-bold hover:bg-[#b3ffb3] transition"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media (max-width: 768px) {
          .cabo-mobile-top-space {
            margin-top: 1rem;
          }
          .cabo-mobile-bottom-space {
            margin-bottom: 3rem;
          }
        }
      `}</style>
    </PublicLayout>
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
