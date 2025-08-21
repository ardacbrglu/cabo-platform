"use client";

/**
 * File: src/app/register/page.js
 * Purpose: Affiliate için kayıt sayfası (manuel + Google precheck).
 *
 * Security Docblock (Cabo PROD Standardı)
 * - Auth: Tek oturum NextAuth (Credentials + Google).
 * - CSRF: İsteğe bağlı /api/auth/csrf → X-CSRF-Token header (apiFetch ile birlikte Origin/Referer, X-Requested-With, X-Request-Id).
 * - Ratelimit: Backend (GET 60/dk, mutasyon 10/dk, IP+userId).
 * - Authorization: requireStatus('active') giriş sonrası; bu sayfa publics.
 * - Validation: Backend Zod+sanitize. İstemci tarafında ekstra trim/pattern ile ön kontrol.
 * - Headers: Global CSP/HSTS/nosniff/strict-origin-when-cross-origin.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import dynamic from "next/dynamic";
import { signIn } from "next-auth/react";
import { apiFetch } from "@/lib/apiFetch";

// SSR hatasını önlemek için captcha’yı dinamik yükle
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
    terms: (
      <>
        I accept the{" "}
        <Link
          href="/terms_privacy"
          className="text-[#81d742] underline hover:text-[#b3ffb3]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms and Privacy Policy
        </Link>
      </>
    ),
    registerBtn: "Register",
    already: "Already have an account?",
    loginLink: "Log in",
    required: "Please fill in all fields.",
    termsReq: "You must accept the terms.",
    captchaReq: "Please complete the captcha.",
    success:
      "Registration successful! Please check your email to activate your account.",
    failed: "Registration failed.",
    server: "Server error. Please try again later.",
    or: "or",
    googleBtn: "Sign up with Google",
    emailSent: "Activation email sent to",
    mailfail:
      "Activation email could not be sent. Please try again later.",
    csrfWait: "Preparing a secure session… Please try again.",
    missingReasons: "To continue:",
  },
  tr: {
    title: "Cabo hesabını oluştur",
    infoTitle: "Cabo ile kazanmaya hazır mısın?",
    infoDesc:
      "Büyüyen affiliate ağımıza katıl — kendine özel linklerini al, paylaş ve alışverişlerden kazan!",
    infoStrong: "Ürünleri seç, linklerini paylaş, ödülünü anında al!",
    li1: "Onay veya ücret gerekmez",
    li2: "Her ürünün sana özel referans linki var",
    li3: "Anlık dashboard: tık, kazanç, çekim",
    li4: "Kazancını istediğin zaman çek, doğrudan banka hesabına",
    faq: "Nasıl çalışıyor merak ettin mi?",
    faqLink: "SSS'yi oku",
    username: "Kullanıcı adı",
    usernamePH: "Kullanıcı adını gir",
    email: "E-posta",
    emailPH: "sen@example.com",
    password: "Şifre",
    passwordPH: "Şifre oluştur",
    terms: (
      <>
        {" "}
        <Link
          href="/terms_privacy"
          className="text-[#81d742] underline hover:text-[#b3ffb3]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Kullanım ve Gizlilik Şartlarını
        </Link>{" "}
        kabul ediyorum
      </>
    ),
    registerBtn: "Kaydol",
    already: "Zaten hesabın var mı?",
    loginLink: "Giriş yap",
    required: "Lütfen tüm alanları doldurun.",
    termsReq: "Şartları kabul etmelisin.",
    captchaReq: "Lütfen robot olmadığınızı doğrulayın.",
    success: "Kayıt başarılı! Aktivasyon için e-postanı kontrol et.",
    failed: "Kayıt başarısız.",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    or: "veya",
    googleBtn: "Google ile kayıt ol",
    emailSent: "Aktivasyon e-postası gönderildi:",
    mailfail:
      "Aktivasyon e-postası gönderilemedi. Lütfen tekrar deneyin.",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen tekrar deneyin.",
    missingReasons: "Devam etmek için:",
  },
};

export default function RegisterPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");

  const [csrfToken, setCsrfToken] = useState("");
  const [csrfReady, setCsrfReady] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // İsteğe bağlı: NextAuth CSRF token'ı al
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (j?.csrfToken) setCsrfToken(j.csrfToken);
      } catch {
        // sessiz düş
      }
      setCsrfReady(true);
    })();
  }, []);

  if (!ready) return null;
  const t = (key) => translations[locale][key] || key;

  const handleSuccessRedirect = () => {
    setTimeout(() => router.push("/login"), 1800);
  };

  const manualMissing = useMemo(() => {
    const arr = [];
    if (!name || !email || !password) arr.push(t("required"));
    if (!terms) arr.push(t("termsReq"));
    if (!captcha) arr.push(t("captchaReq"));
    if (!csrfReady) arr.push(t("csrfWait"));
    return arr;
  }, [name, email, password, terms, captcha, csrfReady, locale]);

  const googleMissing = useMemo(() => {
    const arr = [];
    if (!terms) arr.push(t("termsReq"));
    if (!captcha) arr.push(t("captchaReq"));
    if (!csrfReady) arr.push(t("csrfWait"));
    return arr;
  }, [terms, captcha, csrfReady, locale]);

  // Google: precheck → signIn
  const handleGoogleSignIn = async () => {
    setError("");
    setSuccess("");
    if (!terms) return setError(t("termsReq"));
    if (!captcha) return setError(t("captchaReq"));

    setLoading(true);
    try {
      const res = await apiFetch("/api/register", {
        method: "POST",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          "accept-language": locale || "en",
        },
        body: { termsAccepted: true, captcha, flow: "google" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.message || t("failed"));
        setLoading(false);
        return;
      }
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setError(
        locale === "tr"
          ? "Google ile giriş başarısız oldu."
          : "Google sign-in failed."
      );
      setLoading(false);
    }
  };

  // Manuel kayıt
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name || !email || !password) return setError(t("required"));
    if (!terms) return setError(t("termsReq"));
    if (!captcha) return setError(t("captchaReq"));

    // Son dakika trim/sanitize (ekstra savunma hattı)
    const payload = {
      name: name.trim(),
      email: email.trim(),
      password, // backend zaten zod+sifre politikası uyguluyor
      termsAccepted: terms,
      captcha,
      flow: "manual",
    };

    setLoading(true);
    try {
      const res = await apiFetch("/api/register", {
        method: "POST",
        headers: {
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          "accept-language": locale || "en",
        },
        body: payload,
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        setSuccess(`${t("success")} (${payload.email})`);
        setError("");
        handleSuccessRedirect();
      } else {
        setError(data?.message || t("failed"));
        setSuccess("");
      }
    } catch {
      setError(t("server"));
      setSuccess("");
    } finally {
      setLoading(false);
    }
  };

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
            <div className="text-gray-400 text-sm">
              {t("faq")}{" "}
              <Link
                href="/faq"
                className="text-[#81d742] underline hover:text-[#b3ffb3]"
              >
                {t("faqLink")}
              </Link>
            </div>
          </div>
        </div>

        {/* REGISTER FORM */}
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-[#1a1a1a] border border-[#232323] rounded-2xl shadow-lg p-8 flex flex-col gap-6 items-center"
          autoComplete="off"
          noValidate
        >
          <h3 className="text-3xl md:text-4xl font-bold text-center text-[#d1ffd0] mb-4">
            {t("title")}
          </h3>

          <div className="w-full">
            <label
              htmlFor="name"
              className="block text-base md:text-lg font-semibold mb-1 text-gray-200"
            >
              {t("username")}
            </label>
            <input
              id="name"
              type="text"
              spellCheck={false}
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="off"
              value={name}
              onChange={(e) =>
                setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
              }
              placeholder={t("usernamePH")}
              minLength={3}
              maxLength={32}
              required
              pattern="^[A-Za-z0-9_]{3,32}$"
              title="3-32 characters; letters, digits and underscore only."
              className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base md:text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
          </div>

          <div className="w-full">
            <label
              htmlFor="email"
              className="block text-base md:text-lg font-semibold mb-1 text-gray-200"
            >
              {t("email")}
            </label>
            <input
              id="email"
              type="email"
              spellCheck={false}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="off"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trimStart())}
              placeholder={t("emailPH")}
              required
              className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base md:text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
          </div>

          <div className="w-full">
            <label
              htmlFor="password"
              className="block text-base md:text-lg font-semibold mb-1 text-gray-200"
            >
              {t("password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPH")}
              minLength={8}
              required
              className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base md:text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
          </div>

          <div className="flex items-center gap-2 w-full">
            <input
              id="terms"
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              required
              className="accent-[#81d742] h-5 w-5"
            />
            <label
              htmlFor="terms"
              className="text-base md:text-lg text-gray-400 select-none cursor-pointer flex gap-1 flex-wrap"
            >
              {t("terms")}
            </label>
          </div>

          {/* reCAPTCHA */}
          <Captcha onChange={setCaptcha} lang={locale} />

          {(manualMissing.length > 0 || googleMissing.length > 0) && (
            <div className="w-full -mt-2">
              <div className="text-gray-400 text-sm">{t("missingReasons")}</div>
              <ul className="text-red-500 text-sm list-disc pl-5 space-y-1">
                {[...new Set([...manualMissing, ...googleMissing])].map(
                  (m, i) => (
                    <li key={i}>{m}</li>
                  )
                )}
              </ul>
            </div>
          )}

          {error && (
            <div
              className="text-red-500 text-base md:text-lg text-center"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              className="text-green-400 text-base md:text-lg text-center"
              role="status"
              aria-live="polite"
            >
              {success}
            </div>
          )}

          {/* Manuel kayıt */}
          <button
            type="submit"
            disabled={loading || manualMissing.length > 0}
            aria-disabled={loading || manualMissing.length > 0}
            aria-busy={loading}
            className="w-full py-3 md:py-4 text-base md:text-lg font-semibold bg-[#81d742] text-[#0b0b0b] rounded-lg hover:bg-[#aaff6c] transition"
          >
            {loading
              ? locale === "tr"
                ? "Kaydediliyor..."
                : "Registering..."
              : t("registerBtn")}
          </button>

          {/* Bölücü */}
          <div className="w-full flex items-center justify-between my-3">
            <span className="flex-1 h-px bg-[#232323]" />
            <span className="px-2 text-gray-400 text-sm">{t("or")}</span>
            <span className="flex-1 h-px bg-[#232323]" />
          </div>

          {/* Google kayıt/giriş */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || googleMissing.length > 0}
            aria-disabled={loading || googleMissing.length > 0}
            aria-busy={loading}
            className="w-full py-3 md:py-4 text-base md:text-lg font-semibold bg-white text-[#111] rounded-lg hover:bg-[#e0ffe0] border border-[#232323] transition flex items-center justify-center gap-2"
          >
            <img src="/google.svg" alt="Google" className="w-6 h-6 mr-1" />
            {t("googleBtn")}
          </button>

          <div className="text-sm md:text-base text-gray-400 text-center">
            {t("already")}{" "}
            <Link
              href="/login"
              className="text-[#81d742] underline hover:text-[#b3ffb3]"
            >
              {t("loginLink")}
            </Link>
          </div>
        </form>
      </div>

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
