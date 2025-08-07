"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { signIn } from "next-auth/react";

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
    faq: "Learn more about how Cabo helps merchants & affiliate marketers in our ",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    loginBtn: "Log in",
    loggingIn: "Logging in...",
    errorFill: "Please enter your email and password.",
    forgot: "Forgot password?",
    noAccount: "Don’t have an account?",
    registerHere: "Register here",
    or: "or",
    googleBtn: "Sign in with Google",
    googleSignInError: "Google sign-in failed.",
    serverError: "Server error. Please try again later.",
    setPassword: "You signed up with Google. Please set a password to log in.",
    setPasswordLink: "Click to set password"
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
    faq: "Cabo'nun içerik üreticilere ve affiliate kullanıcılara nasıl yardımcı olduğunu SSS'den öğren.",
    emailPlaceholder: "E-posta",
    passwordPlaceholder: "Şifre",
    loginBtn: "Giriş Yap",
    loggingIn: "Giriş yapılıyor...",
    errorFill: "Lütfen e-posta ve şifrenizi girin.",
    forgot: "Şifreni mi unuttun?",
    noAccount: "Hesabın yok mu?",
    registerHere: "Buradan kaydol",
    or: "veya",
    googleBtn: "Google ile giriş yap",
    googleSignInError: "Google ile giriş başarısız oldu.",
    serverError: "Sunucu hatası. Lütfen tekrar deneyin.",
    setPassword: "Google ile kayıt oldunuz. Giriş yapabilmek için şifre belirleyin.",
    setPasswordLink: "Şifre belirlemek için tıklayın"
  }
};

export default function LoginPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();
  const csrfToken = useCsrfToken();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [justActivated, setJustActivated] = useState(false);

  useEffect(() => {
    const autoEmail = params.get("email");
    const from = params.get("from");
    if (autoEmail) setEmail(autoEmail);
    if (from === "activated") setJustActivated(true);
  }, [params]);

  if (!ready) return null;
  const t = (key) => translations[locale][key] || key;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('errorFill'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
          'accept-language': locale || 'en'
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push('/dashboard');
      } else {
        // Google ile şifre belirleme ihtiyacı özel mesajı
        if (
          data.message === t('setPassword') ||
          data.message === translations.tr.setPassword ||
          data.message === translations.en.setPassword
        ) {
          setError("set-password");
        } else {
          setError(data.message || t('errorFill'));
        }
      }
    } catch {
      setError(t('serverError'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setError(t('googleSignInError'));
    }
    setLoading(false);
  };

  return (
    <PublicLayout>
      <div className="flex flex-col md:flex-row w-full items-center justify-center gap-12 py-10 px-4 sm:px-6 max-w-5xl mx-auto min-h-[65vh]">
        {/* LEFT INFO */}
        <div className="max-w-lg w-full mb-8 md:mb-0 flex flex-col items-center text-center mx-auto cabo-mobile-top-space cabo-mobile-bottom-space">
          <div className="mb-6">
            <h2 className="text-4xl md:text-5xl font-bold text-[#d1ffd0] mb-4">
              {t('infoTitle')}
            </h2>
            <p className="text-gray-300 text-lg mb-4">{t('infoDesc')}</p>
            <p className="text-[#81d742] font-semibold text-lg mb-6">{t('infoStrong')}</p>
            <ul
              className="text-gray-400 text-base mb-6 list-disc pl-6 text-left space-y-2 mx-auto"
              style={{ maxWidth: 340 }}
            >
              <li>{t('li1')}</li>
              <li>{t('li2')}</li>
              <li>{t('li3')}</li>
              <li>{t('li4')}</li>
            </ul>
            <div className="text-gray-400 text-sm mb-2">
              {t('faq')}{" "}
              <Link href="/faq" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {locale === "tr" ? "SSS" : "FAQ"}
              </Link>
            </div>
          </div>
        </div>

        {/* LOGIN FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">
            {t('title')}
          </h3>
          {/* Başarı mesajı */}
          {justActivated && (
            <div className="text-green-400 text-base text-center mb-2">
              {locale === "tr"
                ? "Hesabınız aktifleştirildi! Şimdi giriş yapabilirsiniz."
                : "Your account has been activated! You can now log in."}
            </div>
          )}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
            <input
              type="email"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="username"
              className="bg-[#232323] text-white rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              required
              spellCheck="false"
            />
            <input
              type="password"
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              className="bg-[#232323] text-white rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              required
              spellCheck="false"
            />

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-[#81d742] underline hover:text-[#b3ffb3] transition"
                onClick={() => router.push('/password_reset')}
              >
                {t('forgot')}
              </button>
            </div>

            {error && (
              <div className="text-red-500 text-base text-center">
                {error === "set-password" ? (
                  <>
                    {t('setPassword')}
                    <br />
                    <Link href="/create_password" className="text-[#81d742] underline ml-1 hover:text-[#b3ffb3]">
                      {t('setPasswordLink')}
                    </Link>
                  </>
                ) : error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition"
            >
              {loading ? t('loggingIn') : t('loginBtn')}
            </button>

            <div className="flex items-center my-4">
              <span className="flex-1 h-px bg-[#232323]" />
              <span className="px-3 text-gray-400 text-sm font-semibold">{t('or')}</span>
              <span className="flex-1 h-px bg-[#232323]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-white hover:bg-[#e0ffe0] text-[#111] font-bold py-3 rounded-lg border border-[#eee] shadow transition w-full"
            >
              <span className="w-6 h-6 mr-1 inline-block align-middle">
                <svg width="24" height="24" viewBox="0 0 48 48">
                  <g>
                    <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.9 33 30.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3.1l6-5.9C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.1 0 19.1-7.2 19.1-20 0-1.3-.1-2.7-.4-4z"/>
                    <path fill="#34A853" d="M6.3 14.1l7 5.1C15.8 16 19.6 13.5 24 13.5c3.1 0 5.9 1.1 8 3.1l6-5.9C34.5 6.1 29.5 4 24 4c-6.2 0-11.6 2.2-15.7 6.1z"/>
                    <path fill="#FBBC05" d="M24 44c5.3 0 10.1-1.8 13.8-5l-6.4-5.2c-2.1 1.4-4.8 2.2-7.4 2.2-6.3 0-11.6-4.2-13.6-10.2l-7 5.4C6.1 39.8 14.4 44 24 44z"/>
                    <path fill="#EA4335" d="M44.5 20H24v8.5h11.7c-1.6 4.6-6.2 7.5-11.7 7.5-6.3 0-11.6-4.2-13.6-10.2l-7 5.4C6.1 39.8 14.4 44 24 44c10.1 0 19.1-7.2 19.1-20 0-1.3-.1-2.7-.4-4z"/>
                  </g>
                </svg>
              </span>
              {t('googleBtn')}
            </button>
          </form>

          <div className="mt-6 text-gray-400 text-sm">
            {t('noAccount')}{" "}
            <Link href="/register" className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t('registerHere')}
            </Link>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @media (max-width: 768px) {
          .cabo-mobile-top-space {
            margin-top: 1rem !important;
          }
          .cabo-mobile-bottom-space {
            margin-bottom: 1rem !important;
          }
        }
      `}</style>
    </PublicLayout>
  );
}
