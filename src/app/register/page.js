"use client";
/**
 * File: src/app/register/page.js
 * Purpose: Affiliate kayıt (manuel + Google precheck).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import dynamic from "next/dynamic";
import { signIn } from "next-auth/react";
import { apiFetch } from "@/lib/apiFetch";

// reCAPTCHA v3
const Captcha = dynamic(() => import("@/components/Captcha"), { ssr: false });

/* ... translations (aynı) ... */

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

  // Opsiyonel: NextAuth CSRF preload (manuel kayıt için tutuyoruz)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (j?.csrfToken) setCsrfToken(j.csrfToken);
      } catch {}
      setCsrfReady(true);
    })();
  }, []);

  if (!ready) return null;
  const t = (key) => translations[locale][key] || key;

  const handleSuccessRedirect = () => setTimeout(() => router.push("/login"), 1800);

  // Manuel akış için eksikler
  const manualMissing = useMemo(() => {
    const arr = [];
    if (!name || !email || !password) arr.push(t("required"));
    if (!terms) arr.push(t("termsReq"));
    if (!captcha) arr.push(t("captchaReq"));
    if (!csrfReady) arr.push(t("csrfWait"));
    return arr;
  }, [name, email, password, terms, captcha, csrfReady, locale]);

  // Google akışı: CSRF bekletme yok (apiFetch header ekler)
  const googleMissing = useMemo(() => {
    const arr = [];
    if (!terms) arr.push(t("termsReq"));
    if (!captcha) arr.push(t("captchaReq"));
    return arr;
  }, [terms, captcha, locale]);

  // Google: precheck → signIn
  const handleGoogleSignIn = async () => {
    setError(""); setSuccess("");
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
      await signIn("google", { callbackUrl: "/dashboard", redirect: true });
    } catch {
      setError(locale === "tr" ? "Google ile giriş başarısız oldu." : "Google sign-in failed.");
      setLoading(false);
    }
  };

  // Manuel kayıt
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (manualMissing.length) return;

    const payload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
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
        handleSuccessRedirect();
      } else {
        setError(data?.message || t("failed"));
      }
    } catch {
      setError(t("server"));
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
