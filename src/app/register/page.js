"use client";

/**
 * Register — Homepage style (single centered card) ✅ (MOBILE NO-SHIFT)
 *
 * Fixes:
 * - reCAPTCHA iframe mobile overflow (navbar/page shift) -> scale via global CSS + clip on page root
 * - Glow/backdrop is drawn as fixed inset-0 (like Merchant Register) -> no layout overflow
 * - No extra right-side content
 * - Hook order safe (no hooks after early return)
 *
 * Notes:
 * - If you accidentally pasted PublicLayout code into this file before, REMOVE IT.
 *   This file must contain ONLY this component.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import Captcha from "@/components/Captcha";
import { Loader2, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";
import apiFetch from "@/lib/apiFetch";
import { useLocale } from "@/context/LocaleContext";

/* ---------- i18n (page-specific) ---------- */
const dicts = {
  en: {
    kicker: "Affiliate registration",
    title: "Create your Cabo account",
    subtitle: "Tokenized links + real-time tracking. Start earning in minutes.",
    username: "Username",
    usernamePH: "Enter a username",
    email: "Email",
    emailPH: "you@example.com",
    password: "Password",
    passwordPH: "Create a password",
    termsTos: "Terms of Service",
    termsAnd: "and",
    termsPrivacy: "Privacy Policy",
    registerBtn: "Sign up",
    already: "Already have an account?",
    loginLink: "Log in",
    req_name: "Please fill out this field.",
    req_email: "Please fill out this field.",
    req_password: "Please fill out this field.",
    req_terms: "You must accept the terms.",
    req_captcha: "Please verify you are not a robot.",
    invalidEmail: "Invalid email.",
    invalidName: "3–32 chars; letters, numbers, _.",
    weakPassword: "At least 8 chars; include letters and numbers.",
    server: "Server error. Please try again.",
    success: "Registration successful! Check your email to activate your account (also check Spam).",
  },
  tr: {
    kicker: "Affiliate kayıt",
    title: "Cabo hesabını oluştur",
    subtitle: "Token’lı linkler + canlı takip. Dakikalar içinde kazanmaya başla.",
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
    success: "Kayıt başarılı! Aktivasyon için e-postanı kontrol et. (Spam/Junk’a da bak)",
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

export default function RegisterPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();

  const isTR = String(locale || "en").toLowerCase().startsWith("tr");
  const dict = isTR ? dicts.tr : dicts.en;
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

  const [submitted, setSubmitted] = useState(false);
  const firstInvalidRef = useRef(null);
  const pwdRef = useRef(null);

  /**
   * ✅ Hard guard: prevent ANY horizontal scroll on this page while mounted.
   * (We do both html and body because some mobile browsers scroll body instead of html.)
   */
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    const prevRootOX = root.style.overflowX;
    const prevBodyOX = body.style.overflowX;

    root.style.overflowX = "clip";
    body.style.overflowX = "clip";

    return () => {
      root.style.overflowX = prevRootOX || "";
      body.style.overflowX = prevBodyOX || "";
    };
  }, []);

  // Keep “readonly until interaction” behavior
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

  // Suppress unhandled "Timeout" from 3p scripts (captcha)
  useEffect(() => {
    const onUnhandled = (event) => {
      const reason = event?.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason?.message
          ? String(reason.message)
          : "";
      if (msg && msg.toLowerCase().includes("timeout")) {
        event.preventDefault?.();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, []);

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
    if (loading) return;

    setSubmitted(true);
    setServerError("");
    setSuccess("");
    firstInvalidRef.current = null;

    // CAPTCHA FALLBACK
    if (!captcha) {
      try {
        const gre = window.grecaptcha;
        const fromGre = gre?.getResponse ? gre.getResponse() : "";
        const fromGlobal = window.__caboCaptchaToken || "";
        const fromDom = document.querySelector(".cabo-captcha-scale")?.getAttribute("data-token") || "";
        const tok = fromGre || fromGlobal || fromDom || "";
        if (tok) setCaptcha(tok);
      } catch {}
    }

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
          captcha,
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

  const inputBase = useMemo(() => {
    return (
      "w-full rounded-xl px-4 py-3 text-[14px] " +
      "bg-[#111] text-white placeholder-gray-500 " +
      "border border-[#242424] " +
      "focus:outline-none focus:ring-2 focus:ring-[#81d742] focus:border-[#81d742] " +
      "autofill:shadow-[inset_0_0_0_1000px_#111]"
    );
  }, []);

  return (
    <PublicLayout>
      {!ready ? null : (
        <main className="relative w-full overflow-x-clip">
          {/* ✅ Glow like Merchant Register: fixed inset-0 (no overflow) */}
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
            <div className="absolute w-[900px] h-[900px] sm:w-[1100px] sm:h-[1100px] lg:w-[1400px] lg:h-[1400px] rounded-full blur-3xl opacity-20 bg-gradient-to-br from-[#81d742] via-[#ff8a6b] to-[#6be0ff]" />
          </div>

          <div className="relative z-10 w-full flex items-center justify-center min-h-[calc(100svh-var(--public-header-h)-var(--public-footer-h))] md:min-h-[calc(100dvb-var(--public-header-h)-var(--public-footer-h))] py-10 px-4">
            <form
              onSubmit={onSubmit}
              noValidate
              autoComplete="off"
              className="relative w-full max-w-md rounded-2xl border border-[#232323] bg-[#0f0f0f] shadow-[0_18px_60px_rgba(0,0,0,.55)] px-6 sm:px-8 py-8"
              aria-describedby="register-desc"
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

                <p id="register-desc" className="mt-2 text-[13px] text-gray-400">
                  {t("subtitle")}
                </p>
              </div>

              {/* Username */}
              <div className="mt-6 mb-4">
                <label htmlFor="name" className="block text-sm font-semibold mb-1.5 text-gray-200">
                  {t("username")}
                </label>
                <input
                  id="name"
                  type="text"
                  ref={(el) => {
                    if (needsRef("name")) firstInvalidRef.current = el;
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
                  placeholder={t("usernamePH")}
                  className={cx(inputBase, errors.name ? "border-red-500 focus:ring-red-400" : "")}
                  minLength={3}
                  maxLength={32}
                  required
                />
                {submitted && errors.name && (
                  <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-semibold mb-1.5 text-gray-200">
                  {t("email")}
                </label>
                <input
                  id="email"
                  type="email"
                  ref={(el) => {
                    if (needsRef("email")) firstInvalidRef.current = el;
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trimStart())}
                  placeholder={t("emailPH")}
                  className={cx(inputBase, errors.email ? "border-red-500 focus:ring-red-400" : "")}
                  required
                />
                {submitted && errors.email && (
                  <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="mb-5">
                <label htmlFor="password" className="block text-sm font-semibold mb-1.5 text-gray-200">
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
                  className={cx(inputBase, errors.password ? "border-red-500 focus:ring-red-400" : "")}
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {submitted && errors.password && (
                  <p className="mt-2 text-sm text-red-400" aria-live="assertive">
                    {errors.password}
                  </p>
                )}
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
                <label htmlFor="terms" className="text-sm text-gray-300 leading-relaxed">
                  <Link
                    href={`/terms?lang=${isTR ? "tr" : "en"}`}
                    target="_blank"
                    className="text-[#81d742] underline hover:text-[#b3ffb3]"
                  >
                    {t("termsTos")}
                  </Link>{" "}
                  {t("termsAnd")}{" "}
                  <Link
                    href={`/privacy?lang=${isTR ? "tr" : "en"}`}
                    target="_blank"
                    className="text-[#81d742] underline hover:text-[#b3ffb3]"
                  >
                    {t("termsPrivacy")}
                  </Link>
                </label>
              </div>

              {submitted && errors.terms && (
                <p className="mt-[-6px] mb-3 text-sm text-red-400 flex items-center gap-1.5" role="alert">
                  <AlertTriangle size={16} /> {errors.terms}
                </p>
              )}

              {/* CAPTCHA — same style as merchant (scale via CSS, no layout overflow) */}
              <div
                className={cx(
                  "mb-5 rounded-2xl border border-[#232323] bg-[#0b0b0b] p-4 overflow-hidden",
                  submitted && errors.captcha ? "ring-2 ring-red-400" : ""
                )}
                aria-invalid={submitted && errors.captcha ? "true" : "false"}
              >
                <div className="w-full flex justify-center">
                  <div className="cabo-captcha-scale">
                    <Captcha
                      key={captchaResetKey}
                      onChange={(v) => setCaptcha(v || "")}
                      lang={(locale || "tr").toLowerCase()}
                      theme="light"
                      className="mb-2"
                    />
                  </div>
                </div>

                {submitted && errors.captcha && (
                  <p className="mt-2 text-sm text-red-400" role="alert">
                    {errors.captcha}
                  </p>
                )}
              </div>

              {/* Server messages */}
              {serverError && (
                <div className="text-red-400 text-sm text-center mb-3" role="alert" aria-live="assertive">
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
                    <Loader2 className="animate-spin" size={18} /> {t("registerBtn")}
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2">
                    {t("registerBtn")} <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>

              <div className="text-sm text-gray-400 text-center pt-4">
                {t("already")}{" "}
                <Link href="/login" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                  {t("loginLink")}
                </Link>
              </div>
            </form>
          </div>

          {/* ✅ Captcha scale identical approach as merchant register */}
          <style jsx global>{`
            .cabo-captcha-scale {
              transform-origin: center top;
            }
            @media (max-width: 420px) {
              .cabo-captcha-scale {
                transform: scale(0.92);
              }
            }
            @media (min-width: 421px) {
              .cabo-captcha-scale {
                transform: scale(1);
              }
            }
          `}</style>
        </main>
      )}
    </PublicLayout>
  );
}