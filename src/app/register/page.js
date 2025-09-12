"use client";

/**
 * Register — centered, single card
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import Captcha from "@/components/Captcha";
import { Loader2, AlertTriangle } from "lucide-react";
import apiFetch from "@/lib/apiFetch";
import { useLocale } from "@/context/LocaleContext";

const dicts = {
  en: { /* ... İngilizce sözlük ... */ },
  tr: {
    title: "Cabo hesabını oluştur",
    username: "Kullanıcı adı",
    usernamePH: "Kullanıcı adını gir",
    email: "E-posta",
    emailPH: "sen@example.com",
    password: "Şifre",
    passwordPH: "Şifre oluştur",
    termsTos: "Kullanım Koşulları",
    termsAnd: "ve",
    termsPrivacy: "Gizlilik Politikası",
    registerBtn: "Kaydol",
    already: "Zaten hesabın var mı?",
    loginLink: "Giriş yap",
    req_name: "Lütfen bu alanı doldurun.",
    req_email: "Lütfen bu alanı doldurun.",
    req_password: "Lütfen bu alanı doldurun.",
    req_terms: "Şartları kabul etmelisiniz.",
    req_captcha: "Lütfen robot olmadığınızı doğrulayın.",
    invalidEmail: "Geçersiz e-posta.",
    invalidName: "3–32 karakter; harf, rakam, _.",
    weakPassword: "En az 8 karakter; harf ve rakam içermeli.",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    success: "Kayıt başarılı! Girişe yönlendiriliyor…",
  },
};

export default function RegisterPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();
  const isTR = String(locale).toLowerCase().startsWith("tr");
  const t = (k) => (isTR ? dicts.tr[k] : dicts.en[k]) ?? k;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const firstInvalidRef = useRef(null);

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
  const needsRef = (key) => submitted && errors[key] && !firstInvalidRef.current;

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerError("");
    setSuccess("");
    firstInvalidRef.current = null;

    // --- CAPTCHA FALLBACK ---
    if (!captcha) {
      try {
        const gre = window.grecaptcha;
        const fromGre = gre?.getResponse ? gre.getResponse() : "";
        const fromGlobal = window.__caboCaptchaToken || "";
        const fromDom =
          document.querySelector(".cabo-recaptcha-wrap")?.getAttribute("data-token") || "";
        const tok = fromGre || fromGlobal || fromDom || "";
        if (tok) setCaptcha(tok);
      } catch {}
    }
    // ------------------------

    const errs = validate();
    if (Object.keys(errs).length) {
      const order = ["name", "email", "password", "captcha"];
      const firstKey = order.find((k) => errs[k]);
      if (firstKey) requestAnimationFrame(() => firstInvalidRef.current?.focus?.());
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/register", {
        method: "POST",
        headers: { "accept-language": isTR ? "tr" : "en" },
        body: {
          flow: "manual",
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          termsAccepted: true,
          captcha, // artık garanti dolu
        },
        noAuthRedirect: true,
        noRetry: true,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.message || t("server"));
        setCaptcha("");
        setCaptchaResetKey((k) => k + 1);
      } else {
        setSuccess(t("success"));
        setTimeout(() => router.push("/login"), 1400);
      }
    } catch {
      setServerError(t("server"));
      setCaptcha("");
      setCaptchaResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  const inputBase =
    "w-full bg-[#202020] text-white placeholder-gray-400 rounded-lg px-4 py-3 border border-[#343434] " +
    "focus:outline-none focus:ring-2 focus:ring-[#81d742] focus:border-[#81d742] " +
    "autofill:shadow-[inset_0_0_0_1000px_#202020]";

  return (
    <PublicLayout>
      <div className="relative z-0 w-full flex items-center justify-center min-h-[calc(100svh-var(--public-header-h)-var(--public-footer-h))] md:min-h-[calc(100dvb-var(--public-header-h)-var(--public-footer-h))] py-8 md:py-12 px-4">
        <form
          onSubmit={onSubmit}
          noValidate
          autoComplete="off"
          className="w-full max-w-md bg-[#1a1a1a] border border-[#232323] rounded-2xl shadow-lg px-6 sm:px-8 py-8"
          aria-describedby="register-desc"
        >
          <h1 className="text-3xl font-extrabold text-center text-[#d1ffd0] mb-6">
            {t("title")}
          </h1>

          {/* Username */}
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-semibold mb-1.5 text-gray-200">
              {t("username")}
            </label>
            <input
              id="name"
              type="text"
              ref={(el) => { if (needsRef("name")) firstInvalidRef.current = el; }}
              spellCheck={false}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              placeholder={t("usernamePH")}
              className={`${inputBase} ${errors.name ? "border-red-500 focus:ring-red-400" : ""}`}
              minLength={3}
              maxLength={32}
              required
            />
            {submitted && errors.name && <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-semibold mb-1.5 text-gray-200">
              {t("email")}
            </label>
            <input
              id="email"
              type="email"
              ref={(el) => { if (needsRef("email")) firstInvalidRef.current = el; }}
              spellCheck={false}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value.trimStart())}
              placeholder={t("emailPH")}
              className={`${inputBase} ${errors.email ? "border-red-500 focus:ring-red-400" : ""}`}
              required
            />
            {submitted && errors.email && <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="mb-5">
            <label htmlFor="password" className="block text-sm font-semibold mb-1.5 text-gray-200">
              {t("password")}
            </label>
            <input
              id="password"
              name="new-password"
              ref={(el) => { if (needsRef("password")) firstInvalidRef.current = el; pwdRef.current = el; }}
              type="password"
              inputMode="text"
              autoComplete="new-password"
              autoCorrect="off"
              spellCheck="false"
              placeholder={t("passwordPH")}
              className={`${inputBase} ${errors.password ? "border-red-500 focus:ring-red-400" : ""}`}
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {submitted && errors.password && <p className="mt-2 text-sm text-red-400" aria-live="assertive">{errors.password}</p>}
          </div>

          {/* Terms */}
          <div className="mb-4 flex items-start gap-3">
            <input
              id="terms"
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              required
              className="accent-[#81d742] h-5 w-5 mt-0.5"
            />
            <label htmlFor="terms" className="text-sm text-gray-300">
              <Link href={`/terms?lang=${isTR ? "tr" : "en"}`} target="_blank" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {t("termsTos")}
              </Link>{" "}
              {t("termsAnd")}{" "}
              <Link href={`/privacy?lang=${isTR ? "tr" : "en"}`} target="_blank" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {t("termsPrivacy")}
              </Link>
            </label>
          </div>
          {submitted && errors.terms && (
            <p className="mt-[-6px] mb-3 text-sm text-red-400 flex items-center gap-1.5" role="alert">
              <AlertTriangle size={16} /> {errors.terms}
            </p>
          )}

          
          {/* CAPTCHA */}
          <div
            className={`mb-5 ${submitted && errors.captcha ? "ring-2 ring-red-400 rounded-xl p-2" : ""}`}
            aria-invalid={submitted && errors.captcha ? "true" : "false"}
          >
            <Captcha
              key={captchaResetKey}                // <— reset için
              onChange={(v) => setCaptcha(v || "")}
              lang={(locale || "tr").toLowerCase()} // <— doğru dil kodu
              theme="light"
              className="mb-3"
            />
            {submitted && errors.captcha && (
              <p className="mt-2 text-sm text-red-400" role="alert">
                {errors.captcha}
              </p>
            )}
          </div>


          {/* Server messages */}
          {serverError && (
            <div className="text-red-500 text-sm text-center mb-3" role="alert" aria-live="assertive">
              {serverError}
            </div>
          )}
          {success && (
            <div className="text-green-400 text-sm text-center mb-3" role="status" aria-live="polite">
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 text-base font-semibold bg-[#81d742] text-[#0b0b0b] rounded-lg hover:bg-[#aaff6c] transition disabled:opacity-60"
          >
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> {t("registerBtn")}</span> : t("registerBtn")}
          </button>

          <div className="text-sm text-gray-400 text-center pt-4">
            {t("already")}{" "}
            <Link href="/login" className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t("loginLink")}
            </Link>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}
