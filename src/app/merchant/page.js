"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { apiFetch } from "@/lib/apiFetch";
import { AlertTriangle } from "lucide-react";

/* i18n */
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
    faq: "Learn more about merchant features in our FAQ",
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
    faq: "Satıcı özellikleri hakkında SSS'den bilgi alın.",
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
  },
};

/** Mini tooltip; ilk submit'te görünür, tıklayınca/focus'ta kapanır */
function FieldHint({ show, message }) {
  if (!show) return null;
  return (
    <div className="absolute -top-10 left-0 z-[5] rounded-md bg-[#222] text-white text-sm px-3 py-2 shadow-lg border border-[#333]">
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

export default function MerchantLoginPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();
  const { csrfToken } = useCsrfToken();

  const t = useMemo(() => (k) => translations[locale]?.[k] ?? k, [locale]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  // tooltip kontrolü
  const [submitted, setSubmitted] = useState(false);
  const [hintsVisible, setHintsVisible] = useState(false);
  const firstInvalidRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = showForgot ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showForgot]);

  // global click ile ipuçlarını kapat
  useEffect(() => {
    function close() {
      setHintsVisible(false);
    }
    if (hintsVisible) {
      window.addEventListener("pointerdown", close, { once: true });
      return () => window.removeEventListener("pointerdown", close);
    }
  }, [hintsVisible]);

  if (!ready) return null;

  const validate = () => {
    const errs = {};
    if (!email) errs.email = t("req_email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t("invalidEmail");
    if (!password) errs.password = t("req_password");
    return errs;
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setHintsVisible(true);
    setServerError("");
    firstInvalidRef.current = null;

    const errs = validate();
    if (Object.keys(errs).length) {
      setTimeout(() => firstInvalidRef.current?.focus(), 0);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/merchant_login", {
        method: "POST",
        headers: {
          "accept-language": locale || "en",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: { email: email.trim().toLowerCase(), password },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        // pending / locked / invalid vs. backend mesajını göster
        setServerError(data?.message || (locale === "tr" ? "Giriş başarısız." : "Login failed."));
      } else {
        router.push("/merchant/dashboard");
      }
    } catch {
      setServerError(locale === "tr" ? "Giriş başarısız. Lütfen tekrar deneyin." : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const errors = submitted ? validate() : {};
  const show = (name) => hintsVisible && !!errors[name];
  const needsRef = (name) => submitted && errors[name] && !firstInvalidRef.current;

  // register ile aynı input stili
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
            <p className="text-[#81d742] font-semibold text-lg mb-6">{t("infoStrong")}</p>
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
              {t("faq")}{" "}
              <Link href="/faq" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {locale === "tr" ? "SSS" : "FAQ"}
              </Link>
            </div>
            <div className="text-[#81d742] mt-4 text-base font-semibold">
              {t("howWorksQ")}{" "}
              <Link href="/merchant/info" className="underline hover:text-[#b3ffb3] transition">
                {t("howWorksLink")}
              </Link>
            </div>
          </div>
        </div>

        {/* LOGIN FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">{t("title")}</h3>

          <form onSubmit={onSubmit} className="w-full flex flex-col gap-6" noValidate>
            {/* Email */}
            <div className="relative" onFocus={() => setHintsVisible(false)}>
              <FieldHint show={show("email")} message={errors.email} />
              <input
                ref={(el) => {
                  if (needsRef("email")) firstInvalidRef.current = el;
                }}
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="username"
                required
                spellCheck={false}
                aria-invalid={!!errors.email}
                className={`${inputBase} ${errors.email ? ringErr : ringOk}`}
              />
            </div>

            {/* Password */}
            <div className="relative" onFocus={() => setHintsVisible(false)}>
              <FieldHint show={show("password")} message={errors.password} />
              <input
                ref={(el) => {
                  if (needsRef("password")) firstInvalidRef.current = el;
                }}
                type="password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
                spellCheck={false}
                aria-invalid={!!errors.password}
                className={`${inputBase} ${errors.password ? ringErr : ringOk}`}
              />
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
              <div className="text-red-500 text-base text-center" role="alert">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
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

      {/* Şifremi Unuttum Modal (placeholder) */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#181818] rounded-xl shadow-xl p-8 max-w-sm w-full border border-[#232323] text-center">
            <h4 className="text-lg md:text-xl text-[#d1ffd0] font-bold mb-4">{t("forgot")}</h4>
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
