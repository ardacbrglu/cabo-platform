"use client";

/**
 * File: src/app/merchant/register/page.js
 * Purpose: Merchant Register (no Google) — modern form + field-level hints
 * Security Docblock:
 * - All submits go through fetch() with credentials:include.
 * - Sends X-Requested-With and X-Request-Id headers; NextAuth CSRF token header eklenir.
 * - Server-side: Origin/Referer check, rate limit, Zod validation, reCAPTCHA verification.
 * - No sensitive data in client logs. No inline events that leak PII.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle } from "lucide-react";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import dynamic from "next/dynamic";
import { useCsrfToken } from "@/hooks/useCsrfToken";

// reCAPTCHA (SSR off)
const Captcha = dynamic(() => import("@/components/Captcha"), { ssr: false });

/* i18n */
const translations = {
  en: {
    title: "Register Your Business",
    infoTitle: "Grow your business with Cabo",
    infoDesc:
      "Register your business, create your merchant account and start tracking affiliate-driven product sales.",
    infoStrong:
      "Cabo gives you a complete affiliate infrastructure — so you can focus on growth.",
    li1: "Live tracking & conversion validation",
    li2: "Control commissions per product",
    li3: "Webhook integration & analytics",
    li4: "Secure payment reporting",
    loginQ: "Already have a merchant account?",
    loginBtn: "Login here",
    company: "Company Name",
    fullName: "Full Name (Authorized Person)",
    email: "Business Email",
    phone: "Phone Number",
    password: "Password",
    confirmPassword: "Confirm Password",
    submit: "Create Account",
    loading: "Creating...",
    required: "Please fill in all fields.",
    success:
      "Your merchant request has been received and is pending approval. You’ll be notified by email once your account is activated.",
    failed: "Registration failed.",
    invalidCompany: "Company name must be 2–150 valid characters.",
    invalidName:
      "Full name must be 3–40 characters (letters/numbers/space/_).",
    invalidPhone: "Invalid phone number.",
    invalidEmail: "Invalid email address.",
    invalidPassword:
      "Password must be at least 8 characters and include both letters and numbers.",
    passwordMismatch: "Passwords do not match.",
    acceptTerms: (
      <>
        I accept the{" "}
        <Link
          href="/merchant/terms"
          className="text-[#81d742] underline hover:text-[#b3ffb3]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms
        </Link>{" "}
        and{" "}
        <Link
          href="/merchant/privacy"
          className="text-[#81d742] underline hover:text-[#b3ffb3]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </Link>
      </>
    ),
    mustAccept: "You must accept the Terms and Privacy Policy.",
    howWorksQ: "How does our system work?",
    howWorksLink: "See Details",
    csrfWait: "Preparing a secure session… Please try again.",
    // field-level required strings
    req_company: "Please fill out this field.",
    req_name: "Please fill out this field.",
    req_email: "Please fill out this field.",
    req_phone: "Please fill out this field.",
    req_password: "Please fill out this field.",
    req_password2: "Please confirm your password.",
    req_terms: "You must accept the Terms.",
    req_captcha: "Please complete the captcha.",
  },
  tr: {
    title: "İşletmeni Kaydet",
    infoTitle: "İşletmeni Cabo ile büyüt",
    infoDesc:
      "İşletmeni kaydet, satıcı hesabını oluştur ve affiliate yönlendirmeleriyle gelen satışlarını anlık takip et.",
    infoStrong:
      "Cabo eksiksiz bir affiliate altyapısı sunar — sen sadece büyümeye odaklan.",
    li1: "Anlık takip & dönüşüm doğrulama",
    li2: "Ürün başına komisyon kontrolü",
    li3: "Webhook entegrasyonu & analiz",
    li4: "Güvenli ödeme raporları",
    loginQ: "Zaten satıcı hesabın var mı?",
    loginBtn: "Giriş yap",
    company: "Şirket Adı",
    fullName: "Ad Soyad (Yetkili)",
    email: "Firma E-posta",
    phone: "Telefon Numarası",
    password: "Şifre",
    confirmPassword: "Şifre (Tekrar)",
    submit: "Hesabı Oluştur",
    loading: "Kaydediliyor...",
    required: "Lütfen tüm alanları doldurun.",
    success:
      "Satıcı başvurun alındı ve onay bekliyor. Hesabın aktif olduğunda e-posta ile bilgilendirileceksin.",
    failed: "Kayıt başarısız.",
    invalidCompany: "Şirket adı 2–150 geçerli karakter olmalı.",
    invalidName: "Ad Soyad 3–40 karakter olmalı (harf/rakam/boşluk/_).",
    invalidPhone: "Geçersiz telefon numarası.",
    invalidEmail: "Geçersiz e-posta.",
    invalidPassword:
      "Şifre en az 8 karakter olmalı ve hem harf hem rakam içermeli.",
    passwordMismatch: "Şifreler eşleşmiyor.",
    acceptTerms: (
      <>
        <Link
          href="/merchant/terms"
          className="text-[#81d742] underline hover:text-[#b3ffb3]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Kullanım
        </Link>{" "}
        ve{" "}
        <Link
          href="/merchant/privacy"
          className="text-[#81d742] underline hover:text-[#b3ffb3]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Gizlilik Şartlarını
        </Link>{" "}
        kabul ediyorum
      </>
    ),
    mustAccept: "Kullanım ve Gizlilik Şartlarını kabul etmelisin.",
    howWorksQ: "Sistemimiz nasıl çalışır?",
    howWorksLink: "Detaylı Bilgi",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen tekrar deneyin.",
    req_company: "Lütfen bu alanı doldurun.",
    req_name: "Lütfen bu alanı doldurun.",
    req_email: "Lütfen bu alanı doldurun.",
    req_phone: "Lütfen bu alanı doldurun.",
    req_password: "Lütfen bu alanı doldurun.",
    req_password2: "Lütfen şifreyi tekrar girin.",
    req_terms: "Şartları kabul etmelisiniz.",
    req_captcha: "Lütfen robot olmadığınızı doğrulayın.",
  },
};

/** Small tooltip over inputs; hidden until first submit, closes on real user action */
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

export default function MerchantRegisterPage() {
  const { locale, ready } = useLocale();
  const { csrfToken, ready: csrfReady } = useCsrfToken();

  const t = useMemo(
    () => (key) => translations[locale]?.[key] ?? key,
    [locale]
  );

  const [form, setForm] = useState({
    companyName: "",
    name: "",
    email: "",
    password: "",
    password2: "",
    phone: "",
    countryCode: "+90",
  });
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState("");

  // Tooltip visibility (after first submit)
  const [hintsVisible, setHintsVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const firstInvalidRef = useRef(null);

  // NEW: programatik odak ile kullanıcı odaklanmasını ayırt edelim (blink fix)
  const programmaticFocusRef = useRef(false);

  // preload NextAuth CSRF cookies
  useEffect(() => {
    fetch("/api/auth/csrf", { credentials: "include" }).catch(() => {});
  }, []);

  // gerçek kullanıcı etkileşiminde ipuçlarını kapat (pointer/keyboard)
  useEffect(() => {
    function closeHints() {
      setHintsVisible(false);
    }
    if (hintsVisible) {
      window.addEventListener("pointerdown", closeHints, { once: true });
      window.addEventListener("keydown", closeHints, { once: true });
      return () => {
        window.removeEventListener("pointerdown", closeHints);
        window.removeEventListener("keydown", closeHints);
      };
    }
  }, [hintsVisible]);

  if (!ready) return null;

  const onChange = (e) => {
    const { name, value } = e.target;
    setServerError("");
    if (name === "phone") {
      const digits = value.replace(/\D+/g, "");
      setForm((s) => ({ ...s, phone: digits }));
      return;
    }
    setForm((s) => ({ ...s, [name]: value }));
  };

  const reName = /^[\p{L}\p{N}_ ]+$/u;
  const reCompany = /^[\p{L}\p{N}\s&_.,'’()-]+$/u;

  const validate = () => {
    const errs = {};
    if (!form.companyName) errs.companyName = t("req_company");
    else if (
      form.companyName.length < 2 ||
      form.companyName.length > 150 ||
      !reCompany.test(form.companyName.trim())
    )
      errs.companyName = t("invalidCompany");

    if (!form.name) errs.name = t("req_name");
    else if (
      form.name.length < 3 ||
      form.name.length > 40 ||
      !reName.test(form.name.trim())
    )
      errs.name = t("invalidName");

    if (!form.email) errs.email = t("req_email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = t("invalidEmail");

    if (!form.phone) errs.phone = t("req_phone");
    else if (!/^\d{10,15}$/.test(form.phone)) errs.phone = t("invalidPhone");

    if (!form.password) errs.password = t("req_password");
    else if (
      form.password.length < 8 ||
      !/\d/.test(form.password) ||
      !/[a-zA-Z]/.test(form.password)
    )
      errs.password = t("invalidPassword");

    if (!form.password2) errs.password2 = t("req_password2");
    else if (form.password2 !== form.password)
      errs.password2 = t("passwordMismatch");

    if (!terms) errs.terms = t("req_terms");
    if (!captcha) errs.captcha = t("req_captcha");
    if (!csrfReady || !csrfToken) errs.csrf = t("csrfWait");

    return errs;
  };

  // programatik odak sırasında focus ile ipuçlarını kapatma
  const handleFocus = () => {
    if (!programmaticFocusRef.current) {
      setHintsVisible(false);
    }
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerError("");
    setSuccess(false);
    firstInvalidRef.current = null;

    const errs = validate();
    if (Object.keys(errs).length) {
      // Önce programatik odak bayrağını aç
      programmaticFocusRef.current = true;

      // İlk hatalı alana odaklan
      // (ref callback render’da ayarlanacak)
      requestAnimationFrame(() => {
        firstInvalidRef.current?.focus?.();
        // Odak verildikten kısa bir süre sonra ipucunu göster
        setTimeout(() => {
          programmaticFocusRef.current = false; // artık kullanıcı odaklarını ayırt ederiz
          setHintsVisible(true);
        }, 80);
      });
      return;
    }

    setHintsVisible(false);
    setLoading(true);
    try {
      const fullPhone = `${form.countryCode}${form.phone}`.trim();
      const requestId =
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

      const res = await fetch("/api/register_merchant", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken || "",
          "x-requested-with": "XMLHttpRequest",
          "x-request-id": requestId,
          "accept-language": locale || "en",
        },
        credentials: "include",
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phoneNumber: fullPhone,
          termsAccepted: true,
          captcha,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.message || t("failed"));
      } else {
        setSuccess(true);
        setTimeout(() => {
          window.location.assign("/merchant"); // merchant login
        }, 2200);
      }
    } catch {
      setServerError(t("failed"));
    } finally {
      setLoading(false);
    }
  }

  // Hatalar sadece submit sonrası hesaplanır
  const errors = submitted ? validate() : {};
  const show = (name) => hintsVisible && !!errors[name];
  const needsRef = (name) =>
    submitted && errors[name] && !firstInvalidRef.current;

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
              {t("loginQ")}{" "}
              <Link
                href="/merchant"
                className="text-[#81d742] underline hover:text-[#b3ffb3]"
              >
                {t("loginBtn")}
              </Link>
            </div>
            <div className="text-[#81d742] mt-4 text-base font-semibold">
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

        {/* FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">
            {t("title")}
          </h3>

          <form
            onSubmit={onSubmit}
            className="w-full flex flex-col gap-6"
            autoComplete="off"
            noValidate
          >
            {/* Company */}
            <div className="relative" onFocus={handleFocus}>
              <FieldHint show={show("companyName")} message={errors.companyName} />
              <input
                ref={(el) => {
                  if (needsRef("companyName")) firstInvalidRef.current = el;
                }}
                type="text"
                name="companyName"
                placeholder={t("company")}
                value={form.companyName}
                onChange={onChange}
                required
                aria-invalid={!!errors.companyName}
                className={`${inputBase} ${errors.companyName ? ringErr : ringOk}`}
              />
            </div>

            {/* Name */}
            <div className="relative" onFocus={handleFocus}>
              <FieldHint show={show("name")} message={errors.name} />
              <input
                ref={(el) => {
                  if (needsRef("name")) firstInvalidRef.current = el;
                }}
                type="text"
                name="name"
                placeholder={t("fullName")}
                value={form.name}
                onChange={onChange}
                required
                aria-invalid={!!errors.name}
                className={`${inputBase} ${errors.name ? ringErr : ringOk}`}
              />
            </div>

            {/* Email */}
            <div className="relative" onFocus={handleFocus}>
              <FieldHint show={show("email")} message={errors.email} />
              <input
                ref={(el) => {
                  if (needsRef("email")) firstInvalidRef.current = el;
                }}
                type="email"
                name="email"
                placeholder={t("email")}
                value={form.email}
                onChange={onChange}
                required
                aria-invalid={!!errors.email}
                className={`${inputBase} ${errors.email ? ringErr : ringOk}`}
              />
            </div>

            {/* Phone */}
            <div className="flex gap-3">
              <select
                name="countryCode"
                value={form.countryCode}
                onChange={onChange}
                className="bg-white text-black rounded-lg px-3 py-3 border border-[#232323] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                aria-label="Country code"
              >
                <option value="+90">🇹🇷 +90</option>
                <option value="+1">🇺🇸 +1</option>
              </select>
              <div className="relative flex-1" onFocus={handleFocus}>
                <FieldHint show={show("phone")} message={errors.phone} />
                <input
                  ref={(el) => {
                    if (needsRef("phone")) firstInvalidRef.current = el;
                  }}
                  type="tel"
                  name="phone"
                  placeholder={t("phone")}
                  value={form.phone}
                  onChange={onChange}
                  inputMode="numeric"
                  required
                  aria-invalid={!!errors.phone}
                  className={`${inputBase} ${errors.phone ? ringErr : ringOk}`}
                />
              </div>
            </div>

            {/* Password */}
            <div className="relative" onFocus={handleFocus}>
              <FieldHint show={show("password")} message={errors.password} />
              <input
                ref={(el) => {
                  if (needsRef("password")) firstInvalidRef.current = el;
                }}
                type="password"
                name="password"
                placeholder={t("password")}
                value={form.password}
                onChange={onChange}
                minLength={8}
                autoComplete="new-password"
                required
                aria-invalid={!!errors.password}
                className={`${inputBase} ${errors.password ? ringErr : ringOk}`}
              />
            </div>

            {/* Confirm Password */}
            <div className="relative" onFocus={handleFocus}>
              <FieldHint show={show("password2")} message={errors.password2} />
              <input
                ref={(el) => {
                  if (needsRef("password2")) firstInvalidRef.current = el;
                }}
                type="password"
                name="password2"
                placeholder={t("confirmPassword")}
                value={form.password2}
                onChange={onChange}
                minLength={8}
                autoComplete="new-password"
                required
                aria-invalid={!!errors.password2}
                className={`${inputBase} ${errors.password2 ? ringErr : ringOk}`}
              />
            </div>

            {/* Terms */}
            <div className="relative flex items-center gap-2 mb-1" onFocus={handleFocus}>
              <input
                id="terms"
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                required
                aria-invalid={!!errors.terms}
                className="accent-[#81d742] h-4 w-4"
              />
              <label
                htmlFor="terms"
                className="text-sm text-gray-400 select-none cursor-pointer flex gap-1 flex-wrap"
              >
                {t("acceptTerms")}
              </label>
              <FieldHint show={show("terms")} message={errors.terms} />
            </div>

            {/* CAPTCHA */}
            <div className="relative" onFocus={handleFocus}>
              <Captcha onChange={setCaptcha} lang={locale} />
              <FieldHint show={show("captcha")} message={errors.captcha} />
            </div>

            {serverError && (
              <p className="text-red-500 text-base" role="alert" aria-live="polite">
                {serverError}
              </p>
            )}
            {success && (
              <p className="text-green-400 text-base" role="status" aria-live="polite">
                {t("success")}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="animate-spin" size={18} />
                  {t("loading")}
                </span>
              ) : (
                t("submit")
              )}
            </button>
          </form>
        </div>
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
