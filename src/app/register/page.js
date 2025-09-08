"use client";

/**
 * Affiliate Register (manual only, Google disabled)
 * - Terms & Privacy links go to /terms and /privacy with ?lang=tr|en
 * - a11y: first invalid focus, aria-live messages
 *
 * Security Docblock (Cabo PROD):
 * - Form submit client-side; **page refresh yok**.
 * - /api/register çağrısında apiFetch → noAuthRedirect:true, noRetry:true
 *   (401/403/4xx’larda otomatik yönlendirme ve retry kapalı).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import NextDynamic from "next/dynamic";
import { AlertTriangle, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

const Captcha = NextDynamic(() => import("@/components/Captcha"), { ssr: false });

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
    googleBtn: "Sign up with Google",
    googleSoon: "Google sign-up — coming soon",
    success: "Registration successful! Please check your email to activate your account.",
    failed: "Registration failed.",
    server: "Server error. Please try again later.",
    req_name: "Please fill out this field.",
    req_email: "Please fill out this field.",
    req_password: "Please fill out this field.",
    req_terms: "You must accept the terms.",
    req_captcha: "Please complete the captcha.",
    invalidEmail: "Invalid email address.",
    invalidName: "3–32 chars; letters, digits, _ only.",
    weakPassword: "At least 8 chars and include letters and numbers.",
    registering: "Registering...",
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
    googleBtn: "Google ile kayıt ol",
    googleSoon: "Google ile kayıt — yakında",
    success: "Kayıt başarılı! Aktivasyon için e-postanı kontrol et.",
    failed: "Kayıt başarısız.",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    req_name: "Lütfen bu alanı doldurun.",
    req_email: "Lütfen bu alanı doldurun.",
    req_password: "Lütfen bu alanı doldurun.",
    req_terms: "Şartları kabul etmelisiniz.",
    req_captcha: "Lütfen robot olmadığınızı doğrulayın.",
    invalidEmail: "Geçersiz e-posta.",
    invalidName: "3–32 karakter; harf, rakam, _.",
    weakPassword: "En az 8 karakter; harf ve rakam içermeli.",
    registering: "Kaydediliyor...",
  },
};

function TermsHint({ show, message }) {
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

function TermsLabel({ locale }) {
  const isTr = String(locale || "en").toLowerCase().startsWith("tr");
  const lang = isTr ? "tr" : "en";
  const dict = isTr ? translations.tr : translations.en;
  return (
    <>
      {dict.termsPrefix ? <>{dict.termsPrefix} </> : null}
      <Link
        href={`/terms?lang=${lang}`}
        className="text-[#81d742] underline hover:text-[#b3ffb3]"
        target="_blank"
        rel="noopener noreferrer"
      >
        {dict.termsTos}
      </Link>{" "}
      {dict.termsAnd}{" "}
      <Link
        href={`/privacy?lang=${lang}`}
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

export default function RegisterPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();
  const dict = useMemo(
    () => (String(locale).toLowerCase().startsWith("tr") ? translations.tr : translations.en),
    [locale]
  );
  const t = (k) => dict[k] ?? k;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");

  // tooltip for terms
  const [submitted, setSubmitted] = useState(false);
  const [termsHintVisible, setTermsHintVisible] = useState(false);
  const firstInvalidRef = useRef(null);

  // Parola önerisini bastır
  const pwdRef = useRef(null);
  useEffect(() => {
    const el = pwdRef.current;
    if (!el) return;
    const enable = () => el.removeAttribute("readonly");
    el.setAttribute("readonly", "readonly");
    el.setAttribute("data-lpignore", "true");
    el.setAttribute("data-1p-ignore", "true");
    el.addEventListener("focus", enable, { once: true });
    el.addEventListener("pointerdown", enable, { once: true });
    return () => {
      el.removeEventListener("focus", enable);
      el.removeEventListener("pointerdown", enable);
    };
  }, []);

  useEffect(() => {
    if (!termsHintVisible) return;
    const close = () => setTermsHintVisible(false);
    window.addEventListener("pointerdown", close, { once: true });
    window.addEventListener("keydown", close, { once: true });
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [termsHintVisible]);

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
  const captchaClientError = submitted && errors.captcha ? errors.captcha : "";
  const needsRef = (key) => submitted && errors[key] && !firstInvalidRef.current;

  const inputBase =
    "bg-white text-black rounded-lg px-4 py-3 border border-[#232323] focus:outline-none focus:ring-2 w-full";
  const ringOk = "focus:ring-[#81d742]";
  const ringErr = "focus:ring-red-400 border-red-500";

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerError("");
    setSuccess("");
    firstInvalidRef.current = null;

    const errs = validate();
    setTermsHintVisible(Boolean(errs.terms));

    if (Object.keys(errs).length) {
      const order = ["name", "email", "password", "terms", "captcha"];
      const firstKey = order.find((k) => errs[k] && k !== "terms");
      if (firstKey) requestAnimationFrame(() => firstInvalidRef.current?.focus?.());
      return;
    }

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
        noAuthRedirect: true,
        noRetry: true,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.message || t("failed"));
        setCaptcha("");
        setCaptchaResetKey((k) => k + 1);
      } else {
        setSuccess(t("success"));
        setTimeout(() => router.push("/login"), 1800);
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
          className="w-full max-w-md bg-[#1a1a1a] border border-[#232323] rounded-2xl shadow-lg p-8 flex flex-col gap-6 items-center"
          autoComplete="off"
          noValidate
        >
          <h3 className="text-3xl md:text-4xl font-bold text-center text-[#d1ffd0] mb-2">{t("title")}</h3>

          {/* Username */}
          <div className="w-full">
            <label htmlFor="name" className="block text-base md:text-lg font-semibold mb-1 text-gray-200">
              {t("username")}
            </label>
            <input
              id="name"
              ref={(el) => { if (needsRef("name")) firstInvalidRef.current = el; }}
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              placeholder={t("usernamePH")}
              minLength={3}
              maxLength={32}
              required
              className={`${inputBase} ${errors.name ? ringErr : ringOk}`}
            />
            {submitted && errors.name && <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="w-full">
            <label htmlFor="email" className="block text-base md:text-lg font-semibold mb-1 text-gray-200">
              {t("email")}
            </label>
            <input
              id="email"
              ref={(el) => { if (needsRef("email")) firstInvalidRef.current = el; }}
              type="email"
              spellCheck={false}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value.trimStart())}
              placeholder={t("emailPH")}
              required
              className={`${inputBase} ${errors.email ? ringErr : ringOk}`}
            />
            {submitted && errors.email && <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="w-full">
            <label htmlFor="password" className="block text-base md:text-lg font-semibold mb-1 text-gray-200">
              {t("password")}
            </label>
            <input
              id="password"
              name="new-password"
              ref={(el) => {
                if (needsRef("password")) firstInvalidRef.current = el;
                pwdRef.current = el;
              }}
              type="password"
              inputMode="text"
              autoComplete="new-password"
              autoCorrect="off"
              spellCheck="false"
              placeholder={t("passwordPH")}
              minLength={8}
              required
              className={`${inputBase} ${errors.password ? ringErr : ringOk}`}
            />
            {submitted && errors.password && <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.password}</p>}
          </div>

          {/* Terms + tooltip */}
          <div className="relative flex items-center gap-2 w-full">
            <input
              id="terms"
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              required
              className="accent-[#81d742] h-5 w-5"
            />
            <label htmlFor="terms" className="text-base md:text-lg text-gray-400 select-none cursor-pointer flex gap-1 flex-wrap">
              <TermsLabel locale={locale} />
            </label>
            <TermsHint show={termsHintVisible} message={errors.terms} />
          </div>

          {/* CAPTCHA */}
          <div
            className={`w-full ${captchaClientError ? "ring-2 ring-red-400 rounded-md p-2" : ""}`}
            aria-invalid={captchaClientError ? "true" : "false"}
          >
            {/* Sadece bu sayfada halo’yu tıraşlayan sarmalayıcı */}
            <div className="recaptcha-smooth inline-block overflow-hidden rounded-md">
              <div className="recaptcha-smooth-inner">
                <Captcha
                  onChange={(val) => { setCaptcha(val || ""); }}
                  lang={locale}
                  resetKey={captchaResetKey}
                />
              </div>
            </div>

            {captchaClientError && (
              <p className="mt-2 text-sm text-red-400" role="alert" aria-live="assertive">
                {captchaClientError}
              </p>
            )}
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

          {/* Divider + disabled Google button */}
          <div className="w-full flex items-center justify-between my-2">
            <span className="flex-1 h-px bg-[#232323]" />
            <span className="px-2 text-gray-400 text-sm">{t("or")}</span>
            <span className="flex-1 h-px bg-[#232323]" />
          </div>

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

        /* Register'a özel: doğal reCAPTCHA'da görülen 1px beyaz halo’yu tıraşla */
        .recaptcha-smooth .cabo-recaptcha-clip { overflow: hidden; border-radius: 10px; line-height: 0; }
        .recaptcha-smooth-inner .cabo-recaptcha-box { display: inline-block; margin: -1px; }
        /* Safari/hi-dpi için biraz daha */
        @supports (-webkit-touch-callout:none){
          .recaptcha-smooth-inner .cabo-recaptcha-box { margin: -1.5px; }
        }
      `}</style>
    </PublicLayout>
  );
}

export const runtime = "nodejs";
