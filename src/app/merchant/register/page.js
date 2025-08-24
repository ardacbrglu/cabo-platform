// src/app/register/page.js
"use client";

/**
 * Affiliate Register (manual only) — Google sign-up disabled
 *
 * Security Docblock (Cabo PROD):
 * - All requests go via central apiFetch (credentials:include, X-Requested-With, X-Request-Id).
 * - No custom CSRF on client; server enforces Origin/Referer host match + AJAX + Request-Id + rate limit + reCAPTCHA + Zod.
 * - UI keeps inputs on error; a11y-friendly (aria-live, focus first invalid).
 * - Google sign-up button is intentionally disabled (grey, non-clickable) with a localized "coming soon" notice.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertTriangle, Loader2 } from "lucide-react";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { apiFetch } from "@/lib/apiFetch";

// reCAPTCHA (SSR off)
const Captcha = dynamic(() => import("@/components/Captcha"), { ssr: false });

const translations = {
  en: {
    title: "Create your Cabo account",
    infoTitle: "Ready to earn with Cabo?",
    infoDesc:
      "Join our network of affiliate promoters — get your unique links, share them, and earn when people make purchases.",
    infoStrong: "Claim products, promote your links, and get paid!",
    li1: "No upfront cost or approval needed",
    li2: "Each product has a unique referral link",
    li3: "Real-time dashboard with clicks, earnings, payouts",
    li4: "Withdraw anytime — direct to your bank",
    faq: "Curious how it works?",
    faqLink: "Read the FAQ",
    username: "Username",
    usernamePH: "Enter your username",
    email: "Email",
    emailPH: "you@example.com",
    password: "Password",
    passwordPH: "Create a password",
    termsPrefix: "I accept the",
    termsTos: "Terms of Service",
    termsAnd: "and",
    termsPrivacy: "Privacy Policy",
    registerBtn: "Register",
    already: "Already have an account?",
    loginLink: "Log in",
    or: "or",
    // Google disabled copy
    googleBtn: "Sign up with Google",
    googleSoon: "Google sign-up — coming soon",
    // Server messages
    success:
      "Registration successful! Please check your email to activate your account.",
    failed: "Registration failed.",
    server: "Server error. Please try again later.",
    // Field-level
    req_name: "Please fill out this field.",
    req_email: "Please fill out this field.",
    req_password: "Please fill out this field.",
    req_terms: "You must accept the terms.",
    req_captcha: "Please complete the captcha.",
    invalidEmail: "Invalid email address.",
    invalidName: "3–32 chars; letters, digits, _ only.",
    weakPassword: "At least 8 chars and include letters and numbers.",
  },
  tr: {
    title: "Cabo hesabını oluştur",
    infoTitle: "Cabo ile kazanmaya hazır mısın?",
    infoDesc:
      "Büyüyen affiliate ağımıza katıl — kendine özel linklerini al, paylaş ve alışverişlerden kazan!",
    infoStrong: "Ürünleri seç, linklerini paylaş, ödülünü al!",
    li1: "Onay/ücret gerekmez",
    li2: "Her ürün için benzersiz referans linki",
    li3: "Anlık dashboard: tık, kazanç, çekim",
    li4: "İstediğin zaman banka hesabına çek",
    faq: "Nasıl çalışıyor merak ettin mi?",
    faqLink: "SSS'yi oku",
    username: "Kullanıcı adı",
    usernamePH: "Kullanıcı adını gir",
    email: "E-posta",
    emailPH: "sen@example.com",
    password: "Şifre",
    passwordPH: "Şifre oluştur",
    termsPrefix: "",
    termsTos: "Kullanım Koşulları",
    termsAnd: "ve",
    termsPrivacy: "Gizlilik Politikası’nı",
    registerBtn: "Kaydol",
    already: "Zaten hesabın var mı?",
    loginLink: "Giriş yap",
    or: "veya",
    // Google disabled copy
    googleBtn: "Google ile kayıt ol",
    googleSoon: "Google ile kayıt — yakında",
    // Server messages
    success: "Kayıt başarılı! Aktivasyon için e-postanı kontrol et.",
    failed: "Kayıt başarısız.",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    // Field-level
    req_name: "Lütfen bu alanı doldurun.",
    req_email: "Lütfen bu alanı doldurun.",
    req_password: "Lütfen bu alanı doldurun.",
    req_terms: "Şartları kabul etmelisiniz.",
    req_captcha: "Lütfen robot olmadığınızı doğrulayın.",
    invalidEmail: "Geçersiz e-posta.",
    invalidName: "3–32 karakter; harf, rakam, _.",
    weakPassword: "En az 8 karakter; harf ve rakam içermeli.",
  },
};

function TermsLabel({ locale }) {
  const isTr = String(locale || "en").toLowerCase().startsWith("tr");
  const dict = isTr ? translations.tr : translations.en;
  return (
    <>
      {dict.termsPrefix ? <>{dict.termsPrefix} </> : null}
      <Link
        href={`/terms?lang=${isTr ? "tr" : "en"}`}
        className="text-[#81d742] underline hover:text-[#b3ffb3]"
        target="_blank"
        rel="noopener noreferrer"
      >
        {dict.termsTos}
      </Link>{" "}
      {dict.termsAnd}{" "}
      <Link
        href={`/privacy?lang=${isTr ? "tr" : "en"}`}
        className="text-[#81d742] underline hover:text-[#b3ffb3]"
        target="_blank"
        rel="noopener noreferrer"
      >
        {dict.termsPrivacy}
      </Link>
      {isTr ? " kabul ediyorum" : ""}
    </>
  );
}

function FieldHint({ show, message }) {
  if (!show) return null;
  return (
    <div
      className="absolute -top-10 left-0 z-[5] rounded-md bg-[#222] text-white text-sm px-3 py-2 shadow-lg border border-[#333]"
      role="alert"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-[#ffb74d]" />
        <span>{message}</span>
      </div>
      <span
        aria-hidden
        className="absolute left-4 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-[#222]"
      />
    </div>
  );
}

export default function RegisterPage() {
  const { locale, ready } = useLocale();
  const dict = useMemo(() => {
    const isTr = String(locale || "en").toLowerCase().startsWith("tr");
    return isTr ? translations.tr : translations.en;
  }, [locale]);
  const t = (k) => dict[k] ?? k;

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");

  // validation helpers
  const [submitted, setSubmitted] = useState(false);
  const [hintsVisible, setHintsVisible] = useState(false);
  const firstInvalidRef = useRef(null);
  const programmaticFocusRef = useRef(false);

  useEffect(() => {
    function close() { setHintsVisible(false); }
    if (hintsVisible) {
      window.addEventListener("pointerdown", close, { once: true });
      window.addEventListener("keydown", close, { once: true });
      return () => {
        window.removeEventListener("pointerdown", close);
        window.removeEventListener("keydown", close);
      };
    }
  }, [hintsVisible]);

  if (!ready) return null;

  const validate = () => {
    const errs = {};
    if (!name) errs.name = t("req_name");
    else if (!/^[A-Za-z0-9_]{3,32}$/.test(name)) errs.name = t("invalidName");

    if (!email) errs.email = t("req_email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t("invalidEmail");

    if (!password) errs.password = t("req_password");
    else if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      errs.password = t("weakPassword");

    if (!terms) errs.terms = t("req_terms");
    if (!captcha) errs.captcha = t("req_captcha");
    return errs;
  };

  const errors = submitted ? validate() : {};
  const needsRef = (nameKey) => submitted && errors[nameKey] && !firstInvalidRef.current;
  const showHint = (nameKey) => hintsVisible && !!errors[nameKey] && (nameKey === "terms" || nameKey === "captcha");

  const inputBase =
    "bg-white text-black rounded-lg px-4 py-3 border border-[#232323] focus:outline-none focus:ring-2 w-full";
  const ringOk = "focus:ring-[#81d742]";
  const ringErr = "focus:ring-red-400 border-red-500";

  const handleFocus = () => {
    if (!programmaticFocusRef.current) setHintsVisible(false);
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerError("");
    setSuccess("");
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

    setHintsVisible(false);
    setLoading(true);
    try {
      const res = await apiFetch("/api/register", {
        method: "POST",
        headers: { "accept-language": locale || "en" },
        body: {
          flow: "manual",
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          termsAccepted: true,
          captcha,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.message || t("failed"));
        setCaptcha("");
        setCaptchaResetKey((k) => k + 1);
      } else {
        setSuccess(t("success"));
        setTimeout(() => (window.location.href = "/login"), 1800);
      }
    } catch {
      setServerError(t("server"));
      setCaptcha("");
      setCaptchaResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout>
      <div className="flex flex-col md:flex-row w-full items-center justify-center gap-12 py-10 px-4 sm:px-6 max-w-5xl mx-auto min-h-[65vh]">
        {/* LEFT INFO */}
        <div className="max-w-lg w-full mb-8 md:mb-0 flex flex-col items-center text-center mx-auto cabo-mobile-top-space cabo-mobile-bottom-space">
          <div className="mb-6">
            <h2 className="text-4xl md:text-5xl font-bold text-[#d1ffd0] mb-4">{t("infoTitle")}</h2>
            <p className="text-gray-300 text-lg mb-4">{t("infoDesc")}</p>
            <p className="text-[#81d742] font-semibold text-lg mb-6">{t("infoStrong")}</p>
            <ul className="text-gray-400 text-base mb-6 list-disc pl-6 text-left space-y-2 mx-auto" style={{ maxWidth: 340 }}>
              <li>{t("li1")}</li>
              <li>{t("li2")}</li>
              <li>{t("li3")}</li>
              <li>{t("li4")}</li>
            </ul>

            <div className="text-gray-400 text-sm">
              {t("faq")}{" "}
              <Link href="/faq" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {t("faqLink")}
              </Link>
            </div>
          </div>
        </div>

        {/* FORM CARD */}
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md bg-[#1a1a1a] border border-[#232323] rounded-2xl shadow-lg p-8 flex flex-col gap-6 items-center cabo-mobile-bottom-space"
          autoComplete="off"
          noValidate
        >
          <h3 className="text-3xl md:text-4xl font-bold text-center text-[#d1ffd0] mb-2">{t("title")}</h3>

          {/* Username */}
          <div className="w-full relative" onFocus={handleFocus}>
            <input
              ref={(el) => { if (needsRef("name")) firstInvalidRef.current = el; }}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              placeholder={t("usernamePH")}
              minLength={3}
              maxLength={32}
              required
              aria-invalid={!!errors.name}
              className={`${inputBase} ${errors.name ? ringErr : ringOk}`}
            />
            {submitted && errors.name && (
              <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.name}</p>
            )}
          </div>

          {/* Email */}
          <div className="w-full relative" onFocus={handleFocus}>
            <input
              ref={(el) => { if (needsRef("email")) firstInvalidRef.current = el; }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trimStart())}
              placeholder={t("emailPH")}
              required
              aria-invalid={!!errors.email}
              className={`${inputBase} ${errors.email ? ringErr : ringOk}`}
            />
            {submitted && errors.email && (
              <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="w-full relative" onFocus={handleFocus}>
            <input
              ref={(el) => { if (needsRef("password")) firstInvalidRef.current = el; }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPH")}
              minLength={8}
              autoComplete="new-password"
              required
              aria-invalid={!!errors.password}
              className={`${inputBase} ${errors.password ? ringErr : ringOk}`}
            />
            {submitted && errors.password && (
              <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.password}</p>
            )}
          </div>

          {/* Terms (tooltip near checkbox) */}
          <div className="relative flex items-center gap-2 w-full" onFocus={handleFocus}>
            <input
              id="terms"
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              required
              aria-invalid={!!errors.terms}
              className="accent-[#81d742] h-5 w-5"
            />
            <label htmlFor="terms" className="text-base md:text-lg text-gray-400 select-none cursor-pointer flex gap-1 flex-wrap">
              <TermsLabel locale={locale} />
            </label>
            <FieldHint show={showHint("terms")} message={errors.terms} />
          </div>

          {/* CAPTCHA */}
          <div className="w-full relative" onFocus={handleFocus}>
            <Captcha
              onChange={(val) => {
                setCaptcha(val || "");
                if (val) {
                  // hide hint if solved
                }
              }}
              lang={locale}
              resetKey={captchaResetKey}
            />
            <FieldHint show={showHint("captcha")} message={errors.captcha} />
          </div>

          {/* Server messages */}
          {serverError && (
            <div className="text-red-500 text-base text-center" role="alert" aria-live="assertive">
              {serverError}
            </div>
          )}
          {success && (
            <div className="text-green-400 text-base text-center" role="status" aria-live="polite">
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 md:py-4 text-base md:text-lg font-semibold bg-[#81d742] text-[#0b0b0b] rounded-lg hover:bg-[#aaff6c] transition disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={18} /> {t("registerBtn")}
              </span>
            ) : t("registerBtn")}
          </button>

          {/* Divider */}
          <div className="w-full flex items-center justify-between my-2">
            <span className="flex-1 h-px bg-[#232323]" />
            <span className="px-2 text-gray-400 text-sm">{t("or")}</span>
            <span className="flex-1 h-px bg-[#232323]" />
          </div>

          {/* Google disabled notice + disabled button (light grey) */}
          <div className="w-full -mt-1 -mb-1 text-center text-xs text-gray-400 italic select-none">
            {t("googleSoon")}
          </div>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full py-3 md:py-4 text-base md:text-lg font-semibold bg-[#eceff3] text-[#8a8f98] rounded-lg border border-[#d7dbe0] shadow-none cursor-not-allowed select-none flex items-center justify-center gap-2"
          >
            <img src="/google.svg" alt="" className="w-6 h-6 mr-1 opacity-60" />
            {t("googleBtn")}
          </button>

          <div className="text-sm md:text-base text-gray-400 text-center pt-4">
            {t("already")}{" "}
            <Link href="/login" className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t("loginLink")}
            </Link>
          </div>
        </form>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          .cabo-mobile-top-space { margin-top: 1rem; }
          .cabo-mobile-bottom-space { margin-bottom: 3rem; }
        }
      `}</style>
    </PublicLayout>
  );
}
