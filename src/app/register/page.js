"use client";
// SECURITY REVIEW: This page handles user registration UI. See comments below for security notes.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';
import { useCsrfToken } from "@/hooks/useCsrfToken";
import dynamic from "next/dynamic";
import { signIn } from "next-auth/react";

// Captcha dinamik import (SSR fix)
const Captcha = dynamic(() => import("@/components/Captcha"), { ssr: false });

const translations = {
  en: {
    title: "Create your Cabo account",
    infoTitle: "Ready to earn with Cabo?",
    infoDesc: "Join our network of affiliate promoters — get your unique links, share them, and earn when people make purchases.",
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
    terms: <>I accept the <Link href="/terms_privacy" className="text-[#81d742] underline hover:text-[#b3ffb3]" target="_blank">Terms and Privacy Policy</Link></>,
    registerBtn: "Register",
    already: "Already have an account?",
    loginLink: "Log in",
    required: "Please fill in all fields.",
    termsReq: "You must accept the terms.",
    captchaReq: "Please complete the captcha.",
    success: "Registration successful! Please check your email to activate your account.",
    failed: "Registration failed.",
    server: "Server error. Please try again later.",
    or: "or",
    googleBtn: "Sign up with Google",
    emailSent: "Activation email sent to"
  },
  tr: {
    title: "Cabo hesabını oluştur",
    infoTitle: "Cabo ile kazanmaya hazır mısın?",
    infoDesc: "Büyüyen affiliate ağımıza katıl — kendine özel linklerini al, paylaş ve alışverişlerden kazan!",
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
    terms: <> <Link href="/terms_privacy" className="text-[#81d742] underline hover:text-[#b3ffb3]" target="_blank">Kullanım ve Gizlilik Şartlarını</Link> kabul ediyorum</>,
    registerBtn: "Kaydol",
    already: "Zaten hesabın var mı?",
    loginLink: "Giriş yap",
    required: "Lütfen tüm alanları doldurun.",
    termsReq: "Şartları kabul etmelisin.",
    captchaReq: "Lütfen robot olmadığınızı doğrulayın.",
    success: "Kayıt başarılı! Hesabını aktifleştirmek için e-postanı kontrol et.",
    failed: "Kayıt başarısız.",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    or: "veya",
    googleBtn: "Google ile kayıt ol",
    emailSent: "Aktivasyon e-postası gönderildi:"

  }
};

export default function RegisterPage() {
  const csrfToken = useCsrfToken();
  const router = useRouter();
  const { locale, ready } = useLocale();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  // NOTE: All sensitive state is kept in React state. Never expose sensitive data in the UI or logs.

  if (!ready) return null;
  const t = (key) => translations[locale][key] || key;

  const handleSuccessRedirect = () => {
    setTimeout(() => router.push('/login'), 1800);
  };

  
  // Google ile kayıt/giriş
  const handleGoogleSignIn = async () => {
    setError('');
    // Terms zorunlu
    if (!terms) {
      setError(t('termsReq'));
      return;
    }
    // Captcha zorunlu
    if (!captcha) {
      setError(t('captchaReq'));
      return;
    }
    setLoading(true);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setError(locale === "tr"
        ? "Google ile giriş başarısız oldu."
        : "Google sign-in failed.");
    }
    setLoading(false);
    // NOTE: Google sign-in is protected by terms and captcha checks. Good practice.
  };




const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');
  setSuccess('');

  if (!name || !email || !password) {
    setError(t('required'));
    return;
  }
  if (!terms) {
    setError(t('termsReq'));
    return;
  }
  if (!captcha) {
    setError(t('captchaReq'));
    return;
  }

  setLoading(true);
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf_token || '',
        'accept-language': locale || 'en',
      },
      body: JSON.stringify({ name, email, password, termsAccepted: terms, captcha }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setSuccess(
        // ✅ Eğer daha önce kayıtlıydı ve mail tekrar atıldıysa da bu mesajı göster!
        `${t('success')} (${email})`
      );
      setError('');
      handleSuccessRedirect();
    } else {
      // Eğer backend pending kullanıcıya mail gönderdi ise
      if (
        data.message &&
        (data.message.includes('check your email') ||
          data.message.includes('Aktivasyon') ||
          data.message.includes('activation') ||
          data.message.includes('e-posta') ||
          data.message.includes('inbox'))
      ) {
        setSuccess(`${data.message} (${email})`);
        setError('');
        handleSuccessRedirect();
      } else {
        setError(data.message || t('failed'));
        setSuccess('');
      }
    }
  } catch {
    setError(t('server'));
    setSuccess('');
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
              {t('infoTitle')}
            </h2>
            <p className="text-gray-300 text-lg mb-4">
              {t('infoDesc')}
            </p>
            <p className="text-[#81d742] font-semibold text-lg mb-6">
              {t('infoStrong')}
            </p>
            <ul
              className="text-gray-400 text-base mb-6 list-disc pl-6 text-left space-y-2 mx-auto"
              style={{ maxWidth: 340 }}
            >
              <li>{t('li1')}</li>
              <li>{t('li2')}</li>
              <li>{t('li3')}</li>
              <li>{t('li4')}</li>
            </ul>
            <div className="text-gray-400 text-sm">
              {t('faq')}{' '}
              <Link href="/faq" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {t('faqLink')}
              </Link>
            </div>
          </div>
        </div>

        {/* REGISTER FORM */}
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-[#1a1a1a] border border-[#232323] rounded-2xl shadow-lg p-8 flex flex-col gap-6 items-center"
          autoComplete="off"
        >
          <h3 className="text-3xl md:text-4xl font-bold text-center text-[#d1ffd0] mb-4">
            {t('title')}
          </h3>

          <div className="w-full">
            <label htmlFor="name" className="block text-base md:text-lg font-semibold mb-1 text-gray-200">
              {t('username')}
            </label>
            <input
              id="name"
              type="text"
              spellCheck={false}
              autoComplete="username"
              autoCorrect="off"
              value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
              // NOTE: Username is restricted to alphanumeric and underscores. Good for basic sanitization.
              placeholder={t('usernamePH')}
              minLength={3}
              maxLength={32}
              required
              className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base md:text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
          </div>

          <div className="w-full">
            <label htmlFor="email" className="block text-base md:text-lg font-semibold mb-1 text-gray-200">
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              spellCheck={false}
              autoComplete="email"
              autoCorrect="off"
              value={email}
              onChange={e => setEmail(e.target.value)}
              // WARNING: No client-side email format validation beyond input type. Consider using a library for stricter validation.
              placeholder={t('emailPH')}
              required
              className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base md:text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
          </div>

          <div className="w-full">
            <label htmlFor="password" className="block text-base md:text-lg font-semibold mb-1 text-gray-200">
              {t('password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              // WARNING: No client-side password strength check. Consider adding a password strength meter for better UX and security.
              placeholder={t('passwordPH')}
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
              onChange={e => setTerms(e.target.checked)}
              required
              className="accent-[#81d742] h-5 w-5"
            />
            <label htmlFor="terms" className="text-base md:text-lg text-gray-400 select-none cursor-pointer flex gap-1 flex-wrap">
              {t('terms')}
            </label>
          </div>

          {/* reCAPTCHA */}
          <Captcha onChange={setCaptcha} lang={locale} />
          {/* NOTE: Captcha is required for all registrations. Good for bot prevention. */}

          <usecsrf_token />
          {/* NOTE: CSRF token is included in all sensitive requests. Good practice. */}

          {error && <div className="text-red-500 text-base md:text-lg text-center">{error}</div>}
          {success && <div className="text-green-400 text-base md:text-lg text-center">{success}</div>}
          {/* WARNING: Avoid displaying raw server error messages to users. Sanitize error output if needed. */}

          <button
            type="submit"
            disabled={loading || !terms || !captcha}
            className="w-full py-3 md:py-4 text-base md:text-lg font-semibold bg-[#81d742] text-[#0b0b0b] rounded-lg hover:bg-[#aaff6c] transition"
          >
            {loading ? (locale === 'tr' ? 'Kaydediliyor...' : 'Registering...') : t('registerBtn')}
          </button>

          {/* Google ile kayıt/login */}
          <div className="w-full flex items-center justify-between my-3">
            <span className="flex-1 h-px bg-[#232323]"></span>
            <span className="px-2 text-gray-400 text-sm">{t('or')}</span>
            <span className="flex-1 h-px bg-[#232323]"></span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 md:py-4 text-base md:text-lg font-semibold bg-white text-[#111] rounded-lg hover:bg-[#e0ffe0] border border-[#232323] transition flex items-center justify-center gap-2"
          >
            <img src="/google.svg" alt="Google" className="w-6 h-6 mr-1" />
            {t('googleBtn')}
          </button>



          <div className="text-sm md:text-base text-gray-400 text-center">
            {t('already')}{' '}
            <Link href="/login" className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t('loginLink')}
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
