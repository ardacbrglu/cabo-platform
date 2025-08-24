"use client";

/**
 * File: src/app/merchant/register/page.js
 * Purpose: Merchant Register (no Google) — modern form + minimal hints
 *
 * Security Docblock (Cabo PROD):
 * - Tüm istekler merkezi apiFetch ile gider (credentials:include, X-Requested-With, X-Request-Id).
 * - Client'ta özel CSRF preload **yok**. Mutasyonlar için ek header gerekmez.
 * - Server: Origin/Referer host eşleşmesi + AJAX + Request-Id; IP rate-limit; Zod; reCAPTCHA verify.
 * - PII client loglanmaz; inline secret yok.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle } from "lucide-react";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/apiFetch";

// reCAPTCHA (SSR off)
const Captcha = dynamic(() => import("@/components/Captcha"), { ssr: false });

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
    req_company: "Please fill out this field.",
    req_name: "Please fill out this field.",
    req_email: "Please fill out this field.",
    req_phone: "Please fill out this field.",
    req_password: "Please fill out this field.",
    req_password2: "Please confirm your password.",
    req_terms: "You must accept the Terms.",
    req_captcha: "Please complete the captcha.",
    bottomLoginText: "Already have an account?",
    bottomLoginLink: "Log in",
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
    req_company: "Lütfen bu alanı doldurun.",
    req_name: "Lütfen bu alanı doldurun.",
    req_email: "Lütfen bu alanı doldurun.",
    req_phone: "Lütfen bu alanı doldurun.",
    req_password: "Lütfen bu alanı doldurun.",
    req_password2: "Lütfen şifreyi tekrar girin.",
    req_terms: "Şartları kabul etmelisiniz.",
    req_captcha: "Lütfen robot olmadığınızı doğrulayın.",
    bottomLoginText: "Zaten hesabın var mı?",
    bottomLoginLink: "Giriş yap",
  },
};

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
  const t = useMemo(() => (key) => translations[locale]?.[key] ?? key, [locale]);

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
  const [captchaEnabled, setCaptchaEnabled] = useState(true);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState("");

  // Tooltip visibility
  const [hintsVisible, setHintsVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const firstInvalidRef = useRef(null);
  const programmaticFocusRef = useRef(false);

  // Lokal captcha disable desteği
  useEffect(() => {
    const disableLocal = process.env.NEXT_PUBLIC_RECAPTCHA_DISABLE_LOCAL === "1";
    if (disableLocal && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      setCaptchaEnabled(false);
    }
  }, []);

  useEffect(() => {
    function closeHints() { setHintsVisible(false); }
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

    if (name === "email" && captchaEnabled && captcha) {
      setCaptcha("");
      setCaptchaResetKey((k) => k + 1);
    }

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
    else if (form.companyName.length < 2 || form.companyName.length > 150 || !reCompany.test(form.companyName.trim()))
      errs.companyName = t("invalidCompany");

    if (!form.name) errs.name = t("req_name");
    else if (form.name.length < 3 || form.name.length > 40 || !reName.test(form.name.trim()))
      errs.name = t("invalidName");

    if (!form.email) errs.email = t("req_email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = t("invalidEmail");

    if (!form.phone) errs.phone = t("req_phone");
    else if (!/^\d{10,15}$/.test(form.phone)) errs.phone = t("invalidPhone");

    if (!form.password) errs.password = t("req_password");
    else if (form.password.length < 8 || !/\d/.test(form.password) || !/[a-zA-Z]/.test(form.password))
      errs.password = t("invalidPassword");

    if (!form.password2) errs.password2 = t("req_password2");
    else if (form.password2 !== form.password) errs.password2 = t("passwordMismatch");

    if (!terms) errs.terms = t("req_terms");
    if (captchaEnabled && !captcha) errs.captcha = t("req_captcha");

    return errs;
  };

  const handleFocus = () => {
    if (!programmaticFocusRef.current) setHintsVisible(false);
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerError("");
    setSuccess(false);
    firstInvalidRef.current = null;

    const errs = validate();
    if (Object.keys(errs).length) {
      programmaticFocusRef.current = true;
      requestAnimationFrame(() => {
        firstInvalidRef.current?.focus?.();
        setTimeout(() => { programmaticFocusRef.current = false; setHintsVisible(true); }, 80);
      });
      return;
    }

    setHintsVisible(false);
    setLoading(true);
    try {
      const fullPhone = `${form.countryCode}${form.phone}`.trim();

      const res = await apiFetch("/api/register_merchant", {
        method: "POST",
        body: {
          companyName: form.companyName.trim(),
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phoneNumber: fullPhone,
          termsAccepted: true,
          captcha: captchaEnabled ? captcha : undefined,
        },
        headers: { "accept-language": locale || "en" },
      });

      if (res.status === 429) {
        setServerError(translations[locale]?.failed || "Registration failed.");
        if (captchaEnabled) { setCaptcha(""); setCaptchaResetKey((k) => k + 1); }
        setLoading(false);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.message || translations[locale]?.failed || "Registration failed.");
        if (captchaEnabled) { setCaptcha(""); setCaptchaResetKey((k) => k + 1); }
      } else {
        setSuccess(true);
        setTimeout(() => { window.location.assign("/merchant/login"); }, 2200);
      }
    } catch {
      setServerError(translations[locale]?.failed || "Registration failed.");
      if (captchaEnabled) { setCaptcha(""); setCaptchaResetKey((k) => k + 1); }
    } finally {
      setLoading(false);
    }
  }

  const errors = submitted ? validate() : {};
  const show = (name) => hintsVisible && !!errors[name] && (name === "terms" || name === "captcha");
  const needsRef = (name) => submitted && errors[name] && !firstInvalidRef.current;

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
            <h2 className="text-4xl md:text-5xl font-bold text-[#d1ffd0] mb-4">{t("infoTitle")}</h2>
            <p className="text-gray-300 text-lg mb-4">{t("infoDesc")}</p>
            <p className="text-[#81d742] font-semibold text-lg mb-6">{t("infoStrong")}</p>
            <ul className="text-gray-400 text-base mb-6 list-disc pl-6 text-left space-y-2 mx-auto" style={{ maxWidth: 340 }}>
              <li>{t("li1")}</li><li>{t("li2")}</li><li>{t("li3")}</li><li>{t("li4")}</li>
            </ul>

            <div className="text-[#81d742] mt-4 text-base font-semibold">
              {t("howWorksQ")}{" "}
              <Link href="/merchant/info" className="underline hover:text-[#b3ffb3] transition">
                {t("howWorksLink")}
              </Link>
            </div>
          </div>
        </div>

        {/* FORM CARD */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">{t("title")}</h3>

          <form onSubmit={onSubmit} className="w-full flex flex-col gap-6" autoComplete="off" noValidate>
            {/* Company */}
            <div className="relative" onFocus={handleFocus}>
              <input
                ref={(el) => { if (needsRef("companyName")) firstInvalidRef.current = el; }}
                type="text" name="companyName" placeholder={t("company")}
                value={form.companyName} onChange={onChange} required
                aria-invalid={!!errors.companyName}
                className={`${inputBase} ${errors.companyName ? ringErr : ringOk}`}
              />
            </div>

            {/* Name */}
            <div className="relative" onFocus={handleFocus}>
              <input
                ref={(el) => { if (needsRef("name")) firstInvalidRef.current = el; }}
                type="text" name="name" placeholder={t("fullName")}
                value={form.name} onChange={onChange} required
                aria-invalid={!!errors.name}
                className={`${inputBase} ${errors.name ? ringErr : ringOk}`}
              />
            </div>

            {/* Email */}
            <div className="relative" onFocus={handleFocus}>
              <input
                ref={(el) => { if (needsRef("email")) firstInvalidRef.current = el; }}
                type="email" name="email" placeholder={t("email")}
                value={form.email} onChange={onChange} required
                aria-invalid={!!errors.email}
                className={`${inputBase} ${errors.email ? ringErr : ringOk}`}
              />
            </div>

            {/* Phone */}
            <div className="flex gap-3">
              <select
                name="countryCode" value={form.countryCode} onChange={onChange}
                className="bg-white text-black rounded-lg px-3 py-3 border border-[#232323] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                aria-label="Country code"
              >
                <option value="+90">🇹🇷 +90</option>
                <option value="+1">🇺🇸 +1</option>
              </select>
              <div className="relative flex-1" onFocus={handleFocus}>
                <input
                  ref={(el) => { if (needsRef("phone")) firstInvalidRef.current = el; }}
                  type="tel" name="phone" placeholder={t("phone")}
                  value={form.phone} onChange={onChange} inputMode="numeric" required
                  aria-invalid={!!errors.phone}
                  className={`${inputBase} ${errors.phone ? ringErr : ringOk}`}
                />
              </div>
            </div>

            {/* Password */}
            <div className="relative" onFocus={handleFocus}>
              <input
                ref={(el) => { if (needsRef("password")) firstInvalidRef.current = el; }}
                type="password" name="password" placeholder={t("password")}
                value={form.password} onChange={onChange} minLength={8}
                autoComplete="new-password" required aria-invalid={!!errors.password}
                className={`${inputBase} ${errors.password ? ringErr : ringOk}`}
              />
            </div>

            {/* Confirm Password */}
            <div className="relative" onFocus={handleFocus}>
              <input
                ref={(el) => { if (needsRef("password2")) firstInvalidRef.current = el; }}
                type="password" name="password2" placeholder={t("confirmPassword")}
                value={form.password2} onChange={onChange} minLength={8}
                autoComplete="new-password" required aria-invalid={!!errors.password2}
                className={`${inputBase} ${errors.password2 ? ringErr : ringOk}`}
              />
            </div>

            {/* Terms (tooltip açık) */}
            <div className="relative flex items-center gap-2 mb-1" onFocus={handleFocus}>
              <input
                id="terms" type="checkbox" checked={terms}
                onChange={(e) => setTerms(e.target.checked)} required
                aria-invalid={!!errors.terms} className="accent-[#81d742] h-4 w-4"
              />
              <label htmlFor="terms" className="text-sm text-gray-400 select-none cursor-pointer flex gap-1 flex-wrap">
                {t("acceptTerms")}
              </label>
              <FieldHint show={show("terms")} message={errors.terms} />
            </div>

            {/* CAPTCHA (opsiyonel) */}
            {captchaEnabled && (
              <div className="relative" onFocus={handleFocus}>
                <Captcha onChange={setCaptcha} lang={locale} resetKey={captchaResetKey} />
                <FieldHint show={show("captcha")} message={errors.captcha} />
              </div>
            )}

            {/* Server messages */}
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
              type="submit" disabled={loading}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="animate-spin" size={18} /> {t("loading")}
                </span>
              ) : t("submit")}
            </button>
          </form>

          <div className="w-full mt-8 pt-6 border-t border-[#232323] text-center text-sm text-gray-400">
            {t("bottomLoginText")}{" "}
            <Link href="/merchant/login" className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t("bottomLoginLink")}
            </Link>
          </div>
        </div>
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
