"use client";

/**
 * Merchant Register — Affiliate style (single centered card) ✅
 *
 * Security Docblock (Cabo PROD):
 * - Tüm istekler apiFetch wrapper ile (credentials:include, X-Requested-With, X-Request-Id).
 * - Mutasyonlarda client CSRF gerekmez; server Origin/Referer + AJAX + Request-Id doğrular.
 * - reCAPTCHA v2 token TTL ~110s; submit sırasında affiliate formundaki gibi token fallback yapılır.
 * - Locale: Navbar ile aynı kaynaktan (LocaleContext) okunur.
 * - PII console.log yapılmaz.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
import Captcha from "@/components/Captcha";
import { Loader2, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useLocale } from "@/context/LocaleContext";

const dicts = {
  en: {
    kicker: "Secure merchant registration",
    title: "Join Cabo",
    subtitle: "Create your merchant account — pending approval after review.",
    company: "Company Name",
    fullName: "Full Name (Authorized Person)",
    email: "Business Email",
    phone: "Phone Number",
    password: "Password",
    confirmPassword: "Confirm Password",
    submit: "Create Account",
    success: "Your merchant request has been received and is pending approval.",

    // client validation
    req_company: "Please fill out this field.",
    req_name: "Please fill out this field.",
    req_email: "Please fill out this field.",
    req_phone: "Please fill out this field.",
    req_password: "Please fill out this field.",
    req_password2: "Please confirm your password.",
    req_terms: "You must accept the Terms.",
    req_captcha: "Please complete the captcha.",
    invalidCompany: "Company name must be 2–150 valid characters.",
    invalidName:
      "Full name must be 3–40 characters (letters/numbers/space/_). Turkish letters are allowed.",
    invalidPhone: "Invalid phone number.",
    invalidEmail: "Invalid email address.",
    invalidPassword:
      "Password must be at least 8 characters and include both letters and numbers.",
    passwordMismatch: "Passwords do not match.",

    bottomLoginText: "Already have an account?",
    bottomLoginLink: "Log in",

    // map server
    e_required: "Please fill in all fields.",
    e_email: "Invalid email address.",
    e_uniq: "This email is already registered.",
    e_pending: "This email is already pending review.",
    e_already_active: "This email is already active.",
    e_captcha: "Captcha verification failed. Please try again.",
    e_ratelimit: "Too many requests. Please wait and try again.",
    e_server: "Server error. Please try again later.",

    termsLabelA: "I agree to the",
    termsLabelB: "Terms",
    termsLabelC: "and",
    termsLabelD: "Privacy Policy",
  },
  tr: {
    kicker: "Güvenli satıcı kaydı",
    title: "Cabo’ya katıl",
    subtitle: "Satıcı hesabını oluştur — inceleme sonrası onaylanır.",
    company: "Şirket Adı",
    fullName: "Ad Soyad (Yetkili)",
    email: "Firma E-posta",
    phone: "Telefon Numarası",
    password: "Şifre",
    confirmPassword: "Şifre (Tekrar)",
    submit: "Hesabı Oluştur",
    success: "Satıcı başvurun alındı ve onay bekliyor.",

    // client validation
    req_company: "Lütfen bu alanı doldurun.",
    req_name: "Lütfen bu alanı doldurun.",
    req_email: "Lütfen bu alanı doldurun.",
    req_phone: "Lütfen bu alanı doldurun.",
    req_password: "Lütfen bu alanı doldurun.",
    req_password2: "Lütfen şifreyi tekrar girin.",
    req_terms: "Şartları kabul etmelisiniz.",
    req_captcha: "Lütfen robot olmadığınızı doğrulayın.",
    invalidCompany: "Şirket adı 2–150 geçerli karakter olmalı.",
    invalidName:
      "Ad Soyad 3–40 karakter olmalı (harf/rakam/boşluk/_). Türkçe harfler desteklenir.",
    invalidPhone: "Geçersiz telefon numarası.",
    invalidEmail: "Geçersiz e-posta.",
    invalidPassword:
      "Şifre en az 8 karakter olmalı ve hem harf hem rakam içermeli.",
    passwordMismatch: "Şifreler eşleşmiyor.",

    bottomLoginText: "Zaten hesabın var mı?",
    bottomLoginLink: "Giriş yap",

    // map server
    e_required: "Lütfen tüm alanları doldurun.",
    e_email: "Geçersiz e-posta.",
    e_uniq: "Bu e-posta zaten kayıtlı.",
    e_pending: "Bu e-posta zaten incelemede.",
    e_already_active: "Bu e-posta zaten aktif.",
    e_captcha: "Doğrulama başarısız. Lütfen tekrar deneyin.",
    e_ratelimit: "Çok fazla istek. Biraz bekleyip tekrar deneyin.",
    e_server: "Sunucu hatası. Lütfen tekrar deneyin.",

    termsLabelA: "Şunları kabul ediyorum:",
    termsLabelB: "Kullanım Şartları",
    termsLabelC: "ve",
    termsLabelD: "Gizlilik Politikası",
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

export default function MerchantRegisterPage() {
  const { locale, ready } = useLocale();

  const { t, isTR } = useMemo(() => {
    const norm = String(locale || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
    const d = dicts[norm] || dicts.en;
    return { isTR: norm === "tr", t: (k) => (k in d ? d[k] : k) };
  }, [locale]);

  const [form, setForm] = useState({
    companyName: "",
    name: "",
    email: "",
    phone: "",
    countryCode: "+90",
    password: "",
    password2: "",
  });

  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState({});
  const firstInvalidRef = useRef(null);

  useEffect(() => {
    setServerError("");
    setServerFieldErrors({});
  }, [form.email, form.name, form.companyName, form.phone, form.password, form.password2]);

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
    else if (form.name.length < 3 || form.name.length > 40 || !reName.test(form.name.trim()))
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
      !/[A-Za-z]/.test(form.password)
    )
      errs.password = t("invalidPassword");

    if (!form.password2) errs.password2 = t("req_password2");
    else if (form.password2 !== form.password) errs.password2 = t("passwordMismatch");

    if (!terms) errs.terms = t("req_terms");
    if (!captcha) errs.captcha = t("req_captcha");

    for (const [k, v] of Object.entries(serverFieldErrors || {})) {
      if (v && !errs[k]) errs[k] = String(v);
    }

    return errs;
  };

  const errors = submitted ? validate() : {};
  const needsRef = (key) => submitted && errors[key] && !firstInvalidRef.current;

  function mapServerError(json) {
    const code = String(json?.error || json?.error_code || "").toLowerCase();

    if (code.includes("invalid_payload")) {
      if (json?.field) {
        setServerFieldErrors((s) => ({ ...s, [json.field]: json?.message || "" }));
      }
      return json?.message || t("e_required");
    }

    if (code.includes("captcha")) return t("e_captcha");
    if (code.includes("too_many") || code.includes("rate")) return t("e_ratelimit");
    if (code.includes("already_active")) return t("e_already_active");
    if (code.includes("pending")) return t("e_pending");
    if (code.includes("uniq") || code.includes("exists") || code.includes("conflict"))
      return t("e_uniq");
    if (code.includes("email")) return t("e_email");
    if (code.includes("required")) return t("e_required");

    return json?.message || t("e_server");
  }

  // ✅ affiliate login/register input palette
  const inputBase = useMemo(() => {
    return (
      "w-full rounded-xl px-4 py-3 text-[14px] " +
      "bg-[#111] text-white placeholder-gray-500 " +
      "border border-[#242424] " +
      "focus:outline-none focus:ring-2 focus:ring-[#81d742] focus:border-[#81d742] " +
      "autofill:shadow-[inset_0_0_0_1000px_#111]"
    );
  }, []);

  const selectBase =
    "bg-[#111] text-white rounded-xl px-3 py-3 border border-[#242424] " +
    "focus:outline-none focus:ring-2 focus:ring-[#81d742] focus:border-[#81d742]";

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setSubmitted(true);
    setServerError("");
    setSuccess("");
    setServerFieldErrors({});
    firstInvalidRef.current = null;

    // --- CAPTCHA FALLBACK (affiliate register ile aynı mantık) ---
    if (!captcha) {
      try {
        const gre = window.grecaptcha;
        const fromGre = gre?.getResponse ? gre.getResponse() : "";
        const fromGlobal = window.__caboCaptchaToken || "";
        const fromDom =
          document.querySelector(".recaptcha-center")?.getAttribute("data-token") || "";
        const tok = fromGre || fromGlobal || fromDom || "";
        if (tok) setCaptcha(tok);
      } catch {}
    }
    // ------------------------------------------------------------

    const errs = validate();
    if (Object.keys(errs).length) {
      // ilk hatalı alanı fokusla
      const order = ["companyName", "name", "email", "phone", "password", "password2", "captcha"];
      const firstKey = order.find((k) => errs[k]);
      if (firstKey) {
        requestAnimationFrame(() => firstInvalidRef.current?.focus?.());
      }
      return;
    }

    setLoading(true);
    try {
      const fullPhone = `${form.countryCode}${form.phone}`.trim();

      const res = await apiFetch("/api/register_merchant", {
        method: "POST",
        headers: { "accept-language": isTR ? "tr" : "en" },
        body: {
          companyName: form.companyName.trim(),
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phoneNumber: fullPhone,
          termsAccepted: true,
          captcha,
        },
        noAuthRedirect: true,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        const msg = mapServerError(data);
        setServerError(msg);

        // captcha reset
        setCaptcha("");
        setCaptchaResetKey((k) => k + 1);

        return;
      }

      setSuccess(t("success"));
      setTimeout(() => window.location.assign("/merchant/login"), 1600);
    } catch {
      setServerError(t("e_server"));
      setCaptcha("");
      setCaptchaResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout>
      {!ready ? null : (
        <main className="relative w-full">
          <div className="relative z-0 w-full flex items-center justify-center min-h-[calc(100svh-var(--public-header-h)-var(--public-footer-h))] md:min-h-[calc(100dvb-var(--public-header-h)-var(--public-footer-h))] py-10 px-4">
            {/* ✅ same soft glow backdrop as affiliate */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="absolute -inset-24 blur-3xl opacity-25 bg-gradient-to-br from-[#81d742] via-[#ff8a6b] to-[#6be0ff]" />
            </div>

            <form
              onSubmit={onSubmit}
              noValidate
              autoComplete="off"
              className="relative w-full max-w-md rounded-2xl border border-[#232323] bg-[#0f0f0f] shadow-[0_18px_60px_rgba(0,0,0,.55)] px-6 sm:px-8 py-8"
              aria-describedby="merchant-register-desc"
            >
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

              <div className="mt-6 flex flex-col gap-4">
                {/* Company */}
                <div className="relative">
                  <label className="sr-only" htmlFor="company">{t("company")}</label>
                  <input
                    id="company"
                    type="text"
                    ref={(el) => {
                      if (needsRef("companyName")) firstInvalidRef.current = el;
                    }}
                    value={form.companyName}
                    onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))}
                    placeholder={t("company")}
                    className={cx(inputBase, submitted && errors.companyName ? "border-red-500 focus:ring-red-400" : "")}
                    required
                    aria-invalid={!!errors.companyName}
                  />
                  {submitted && errors.companyName && (
                    <p className="mt-2 text-sm text-red-400" role="alert">
                      <AlertTriangle size={14} className="inline mr-1" />
                      {errors.companyName}
                    </p>
                  )}
                </div>

                {/* Full Name */}
                <div className="relative">
                  <label className="sr-only" htmlFor="fullName">{t("fullName")}</label>
                  <input
                    id="fullName"
                    type="text"
                    ref={(el) => {
                      if (needsRef("name")) firstInvalidRef.current = el;
                    }}
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder={t("fullName")}
                    className={cx(inputBase, submitted && errors.name ? "border-red-500 focus:ring-red-400" : "")}
                    required
                    aria-invalid={!!errors.name}
                  />
                  {submitted && errors.name && (
                    <p className="mt-2 text-sm text-red-400" role="alert">
                      <AlertTriangle size={14} className="inline mr-1" />
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div className="relative">
                  <label className="sr-only" htmlFor="email">{t("email")}</label>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    ref={(el) => {
                      if (needsRef("email")) firstInvalidRef.current = el;
                    }}
                    value={form.email}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value.trimStart() }))}
                    placeholder={t("email")}
                    className={cx(inputBase, submitted && errors.email ? "border-red-500 focus:ring-red-400" : "")}
                    required
                    aria-invalid={!!errors.email}
                    autoComplete="username"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                  {submitted && errors.email && (
                    <p className="mt-2 text-sm text-red-400" role="alert">
                      <AlertTriangle size={14} className="inline mr-1" />
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <select
                    value={form.countryCode}
                    onChange={(e) => setForm((s) => ({ ...s, countryCode: e.target.value }))}
                    className={selectBase}
                    aria-label="Country code"
                  >
                    <option value="+90">🇹🇷 +90</option>
                    <option value="+1">🇺🇸 +1</option>
                  </select>

                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    ref={(el) => {
                      if (needsRef("phone")) firstInvalidRef.current = el;
                    }}
                    value={form.phone}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, phone: e.target.value.replace(/\D+/g, "") }))
                    }
                    placeholder={t("phone")}
                    className={cx(inputBase, submitted && errors.phone ? "border-red-500 focus:ring-red-400" : "")}
                    required
                    aria-invalid={!!errors.phone}
                    autoComplete="tel"
                  />
                </div>
                {submitted && errors.phone && (
                  <p className="mt-[-6px] text-sm text-red-400" role="alert">
                    <AlertTriangle size={14} className="inline mr-1" />
                    {errors.phone}
                  </p>
                )}

                {/* Password */}
                <div className="relative">
                  <label className="sr-only" htmlFor="password">{t("password")}</label>
                  <input
                    id="password"
                    type="password"
                    ref={(el) => {
                      if (needsRef("password")) firstInvalidRef.current = el;
                    }}
                    value={form.password}
                    onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                    placeholder={t("password")}
                    className={cx(inputBase, submitted && errors.password ? "border-red-500 focus:ring-red-400" : "")}
                    minLength={8}
                    autoComplete="new-password"
                    required
                    aria-invalid={!!errors.password}
                  />
                  {submitted && errors.password && (
                    <p className="mt-2 text-sm text-red-400" role="alert">
                      <AlertTriangle size={14} className="inline mr-1" />
                      {errors.password}
                    </p>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="relative">
                  <label className="sr-only" htmlFor="password2">{t("confirmPassword")}</label>
                  <input
                    id="password2"
                    type="password"
                    ref={(el) => {
                      if (needsRef("password2")) firstInvalidRef.current = el;
                    }}
                    value={form.password2}
                    onChange={(e) => setForm((s) => ({ ...s, password2: e.target.value }))}
                    placeholder={t("confirmPassword")}
                    className={cx(inputBase, submitted && errors.password2 ? "border-red-500 focus:ring-red-400" : "")}
                    minLength={8}
                    autoComplete="new-password"
                    required
                    aria-invalid={!!errors.password2}
                  />
                  {submitted && errors.password2 && (
                    <p className="mt-2 text-sm text-red-400" role="alert">
                      <AlertTriangle size={14} className="inline mr-1" />
                      {errors.password2}
                    </p>
                  )}
                </div>

                {/* Terms */}
                <div className="flex items-start gap-3 pt-1">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    className="accent-[#81d742] h-5 w-5 mt-0.5"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-300">
                    {t("termsLabelA")}{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      className="text-[#81d742] underline hover:text-[#b3ffb3]"
                    >
                      {t("termsLabelB")}
                    </Link>{" "}
                    {t("termsLabelC")}{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      className="text-[#81d742] underline hover:text-[#b3ffb3]"
                    >
                      {t("termsLabelD")}
                    </Link>
                  </label>
                </div>
                {submitted && errors.terms && (
                  <p className="mt-[-6px] text-sm text-red-400 flex items-center gap-1.5" role="alert">
                    <AlertTriangle size={16} /> {errors.terms}
                  </p>
                )}

                {/* CAPTCHA */}
                <div
                  className={cx(
                    "pt-1",
                    submitted && errors.captcha ? "ring-2 ring-red-400 rounded-xl p-2" : ""
                  )}
                  aria-invalid={submitted && errors.captcha ? "true" : "false"}
                >
                  <Captcha
                    key={captchaResetKey}
                    onChange={(v) => setCaptcha(v || "")}
                    lang={(locale || "tr").toLowerCase()}
                    theme="light"
                    className="mb-2"
                  />
                  {submitted && errors.captcha && (
                    <p className="mt-2 text-sm text-red-400" role="alert">
                      {errors.captcha}
                    </p>
                  )}
                </div>

                {/* Server messages */}
                {serverError && (
                  <div className="text-red-400 text-sm text-center" role="alert" aria-live="assertive">
                    {serverError}
                  </div>
                )}
                {success && (
                  <div className="text-green-400 text-sm text-center" role="status" aria-live="polite">
                    {success}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
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
                      <Loader2 className="animate-spin" size={18} /> {t("submit")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2">
                      {t("submit")} <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </button>

                <div className="pt-1 text-gray-400 text-sm text-center">
                  {t("bottomLoginText")}{" "}
                  <Link
                    href="/merchant/login"
                    prefetch={false}
                    className="text-[#81d742] underline hover:text-[#b3ffb3]"
                  >
                    {t("bottomLoginLink")}
                  </Link>
                </div>
              </div>
            </form>
          </div>

          {/* Autofill mavi görünümü engelle */}
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
