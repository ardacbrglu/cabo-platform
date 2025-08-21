"use client";
/**
 * File: src/app/login/page.js
 * Purpose: Affiliate login (Credentials + Google).
 * Notlar:
 * - Hydration güvenliği: mounted + locale.ready beklenir (React #185 fix).
 * - Oturum guard: yalnızca gerçek NextAuth session varsa redirect; cache'e bakıp atlamaz.
 * - Submit: /api/login (server proxy). apiFetch → credentials:include.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { signIn } from "next-auth/react";
import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { apiFetch } from "@/lib/apiFetch";

const translations = {
  en: {
    title: "User Login",
    infoTitle: "Start earning by sharing",
    infoDesc: "Share product links with your friends, followers or audience — and earn money when they make a purchase.",
    infoStrong: "Promote products, earn commission, track your stats in real-time.",
    li1: "Each product you claim generates a unique referral link",
    li2: "You get paid when people buy through your link",
    li3: "Track your clicks, sales, and earnings from your dashboard",
    li4: "Withdraw your earnings securely",
    faq: "Learn more in our ",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    loginBtn: "Log in",
    loggingIn: "Logging in...",
    errorFill: "Please enter your email and password.",
    errorEmailFormat: "Please enter a valid email address.",
    forgot: "Forgot password?",
    noAccount: "Don’t have an account?",
    registerHere: "Register here",
    or: "or",
    googleBtn: "Sign in with Google",
    googleSignInError: "Google sign-in failed.",
    serverError: "Server error. Please try again later.",
    setPassword: "You signed up with Google. Please log in with your Google account.",
    activatedBanner: "Your account has been activated! You can now log in.",
    csrfWait: "Preparing a secure session… Please wait a moment.",
  },
  tr: {
    title: "Kullanıcı Girişi",
    infoTitle: "Paylaş, kazanmaya başla",
    infoDesc: "Ürün linklerini arkadaşlarınla, takipçilerinle ya da kitlenle paylaş — biri alışveriş yaptığında para kazanmaya başla.",
    infoStrong: "Ürünleri tanıt, komisyon kazan, istatistiklerini anlık takip et.",
    li1: "Her ürün için sana özel referans linki oluşur",
    li2: "Birileri senin linkinden alışveriş yaparsa ödeme alırsın",
    li3: "Tıklama, satış ve kazançlarını panelden takip edebilirsin",
    li4: "Kazancını güvenle çekebilirsin",
    faq: "Daha fazlası SSS'de: ",
    emailPlaceholder: "E-posta",
    passwordPlaceholder: "Şifre",
    loginBtn: "Giriş Yap",
    loggingIn: "Giriş yapılıyor...",
    errorFill: "Lütfen e-posta ve şifrenizi girin.",
    errorEmailFormat: "Lütfen geçerli bir e-posta adresi girin.",
    forgot: "Şifreni mi unuttun?",
    noAccount: "Hesabın yok mu?",
    registerHere: "Buradan kaydol",
    or: "veya",
    googleBtn: "Google ile giriş yap",
    googleSignInError: "Google ile giriş başarısız oldu.",
    serverError: "Sunucu hatası. Lütfen tekrar deneyin.",
    setPassword: "Google ile kayıt oldunuz. Lütfen Google hesabın ile giriş yap.",
    activatedBanner: "Hesabınız aktifleştirildi! Şimdi giriş yapabilirsiniz.",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen bekleyin.",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, ready } = useLocale();

  const t = useMemo(() => {
    const lang = locale === "tr" ? "tr" : "en";
    return (key) => translations[lang][key] ?? key;
  }, [locale]);

  const [mounted, setMounted] = useState(false);       // HYDRATION SAFE
  useEffect(() => { setMounted(true); }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [justActivated, setJustActivated] = useState(false);

  const [csrfToken, setCsrfToken] = useState("");
  const [csrfReady, setCsrfReady] = useState(false);

  const firstInputRef = useRef(null);
  const callbackUrl = searchParams?.get("from") || "/dashboard";

  // Session guard: sadece GERÇEK session varsa at
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
        const s = await r.json().catch(() => null);
        if (s && s.user) {
          router.replace(callbackUrl);
          router.refresh();
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CSRF preload (NextAuth)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (j?.csrfToken) setCsrfToken(j.csrfToken);
      } catch {}
      setCsrfReady(true);
    })();
  }, []);

  // Aktivasyon banner’ı
  useEffect(() => {
    if (searchParams?.get("activated") === "1") {
      setJustActivated(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("activated");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  if (!mounted || !ready) return null;

  const validateEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    if (!email || !password) return setError(t("errorFill"));
    if (!validateEmail(email)) return setError(t("errorEmailFormat"));
    if (!csrfReady) return setError(t("csrfWait"));

    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/login", {
        method: "POST",
        headers: { ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), "accept-language": locale || "en" },
        body: { email: email.trim().toLowerCase(), password },
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success) {
        router.replace(callbackUrl);
        router.refresh();
        setTimeout(() => {
          if (window.location.pathname === "/login") window.location.assign(callbackUrl);
        }, 60);
        return;
      }
      setError(typeof data?.message === "string" && data.message ? data.message : t("serverError"));
    } catch {
      setError(t("serverError"));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setError("");
    setLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError(t("googleSignInError"));
      setLoading(false);
    }
  }

  return (
    <PublicLayout>
      <div className="flex flex-col md:flex-row w-full items-center justify-center gap-12 py-10 px-4 sm:px-6 max-w-5xl mx-auto min-h-[65vh]">
        {/* SOL BİLGİ BLOĞU */}
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
            <div className="text-gray-400 text-sm mb-2">
              {t("faq")}
              <Link prefetch={false} href="/faq" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {locale === "tr" ? "SSS" : "FAQ"}
              </Link>
            </div>
          </div>
        </div>

        {/* FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">{t("title")}</h3>

          {justActivated && (
            <div className="text-green-400 text-base text-center mb-3" role="status" aria-live="polite">
              {t("activatedBanner")}
            </div>
          )}

          {!csrfReady && (
            <div className="text-gray-400 text-sm text-center mb-3" role="status" aria-live="polite">
              {t("csrfWait")}
            </div>
          )}

          <form onSubmit={onSubmit} className="w-full flex flex-col gap-6" noValidate>
            <label className="sr-only" htmlFor="email">{t("emailPlaceholder")}</label>
            <input
              ref={firstInputRef}
              id="email"
              type="email"
              inputMode="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="username"
              autoCapitalize="off"
              spellCheck="false"
              className="bg-[#232323] text-white rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              required
              aria-invalid={!!error && !email}
            />

            <label className="sr-only" htmlFor="password">{t("passwordPlaceholder")}</label>
            <input
              id="password"
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              autoCapitalize="off"
              spellCheck="false"
              className="bg-[#232323] text-white rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              required
              aria-invalid={!!error && !password}
            />

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-[#81d742] underline hover:text-[#b3ffb3] transition"
                onClick={() => router.push("/password_reset")}
              >
                {t("forgot")}
              </button>
            </div>

            {error && (
              <div className="text-red-500 text-base text-center" role="alert" aria-live="assertive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !csrfReady}
              aria-disabled={loading || !csrfReady}
              aria-busy={loading ? "true" : "false"}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
            >
              {loading ? t("loggingIn") : t("loginBtn")}
            </button>

            <div className="flex items-center my-4">
              <span className="flex-1 h-px bg-[#232323]" />
              <span className="px-3 text-gray-400 text-sm font-semibold">{t("or")}</span>
              <span className="flex-1 h-px bg-[#232323]" />
            </div>

            <button
              type="button"
              onClick={onGoogle}
              disabled={loading || !csrfReady}
              aria-disabled={loading || !csrfReady}
              aria-busy={loading ? "true" : "false"}
              className="flex items-center justify-center gap-2 bg-white hover:bg-[#e0ffe0] text-[#111] font-bold py-3 rounded-lg border border-[#eee] shadow transition w-full disabled:opacity-60"
              aria-label={t("googleBtn")}
            >
              <span className="w-6 h-6 mr-1 inline-block align-middle" aria-hidden="true">
                <Image src="/google.svg" width={24} height={24} alt="" priority />
              </span>
              {t("googleBtn")}
            </button>
          </form>

          <div className="mt-6 text-gray-400 text-sm">
            {t("noAccount")}{" "}
            <Link prefetch={false} href="/register" className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t("registerHere")}
            </Link>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          .cabo-mobile-top-space { margin-top: 1rem !important; }
          .cabo-mobile-bottom-space { margin-bottom: 1rem !important; }
        }
      `}</style>
    </PublicLayout>
  );
}
