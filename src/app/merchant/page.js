// app/merchant/page.js
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';
import { useCsrfToken } from '@/hooks/useCsrfToken';

const translations = {
  en: {
    title: "Merchant Login",
    infoTitle: "Grow your business ",
    infoDesc: "List your product, set your commission, and let affiliates drive sales for you.",
    infoStrong: "Promote products, increase sales, manage payouts easily.",
    li1: "Each product you add gets a unique referral link",
    li2: "Track affiliate-driven clicks and sales in real-time",
    li3: "Manage commissions, payouts, and product performance",
    li4: "Integrate easily via webhook, monitor analytics",
    faq: "Learn more about merchant features in our FAQ",
    emailPlaceholder: "Business Email",
    passwordPlaceholder: "Password",
    loginBtn: "Log in",
    loggingIn: "Logging in...",
    errorFill: "Please enter your email and password.",
    forgot: "Forgot password?",
    forgotSoon: "Password reset coming soon!",
    noAccount: "Not registered yet?",
    registerHere: "Register your business",
    howWorksQ: "How does our system work?",
    howWorksLink: "See Details"
  },
  tr: {
    title: "Satıcı Girişi",
    infoTitle: "İşletmeni Cabo ile büyüt",
    infoDesc: "Ürününüzü ekleyin, komisyonu belirleyin, kullanıcılar sizin için satışlar getirsin.",
    infoStrong: "Ürün tanıtın, satışları artırın, ödemeleri kolayca yönetin.",
    li1: "Eklediğiniz her ürün için benzersiz referans linkleri oluşur",
    li2: "Affiliate yönlendirmelerini ve satışları anlık izleyin",
    li3: "Komisyon, ödeme ve performans yönetimi tek panelde",
    li4: "Webhook ile kolay entegrasyon, gelişmiş analiz",
    faq: "Satıcı özellikleri hakkında SSS'den bilgi alın.",
    emailPlaceholder: "İş E-posta",
    passwordPlaceholder: "Şifre",
    loginBtn: "Giriş Yap",
    loggingIn: "Giriş yapılıyor...",
    errorFill: "Lütfen e-posta ve şifrenizi girin.",
    forgot: "Şifreni mi unuttun?",
    forgotSoon: "Şifre sıfırlama yakında!",
    noAccount: "Henüz kaydolmadınız mı?",
    registerHere: "İşletmeni kaydet",
    howWorksQ: "Sistemimiz nasıl çalışır?",
    howWorksLink: "Detaylı Bilgi"
  }
};

export default function MerchantLoginPage() {
  const router = useRouter();
  const { locale, ready } = useLocale();
  const { csrfToken } = useCsrfToken();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const t = (key) => translations[locale]?.[key] || key;

  useEffect(() => {
    if (!ready) return;
    document.body.style.overflow = showForgot ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForgot, ready]);

  if (!ready) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('errorFill'));
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/merchant_login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken || '',
          'accept-language': locale || 'en',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        // Backend anlaşılır mesaj döner: pending, invalid vb.
        setError(data?.message || t('errorFill'));
        setLoading(false);
        return;
      }

      // Başarılı giriş → dashboard
      router.push('/merchant/dashboard');
    } catch {
      setError(locale === 'tr' ? 'Giriş başarısız. Lütfen tekrar deneyin.' : 'Login failed. Please try again.');
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
            <div className="text-gray-400 text-sm mb-2">
              {t('faq')}{" "}
              <Link href="/faq" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {locale === "tr" ? "SSS" : "FAQ"}
              </Link>
            </div>
            <div className="text-[#81d742] mt-4 text-base font-semibold">
              {t('howWorksQ')}{" "}
              <Link
                href="/merchant/info"
                className="underline hover:text-[#b3ffb3] transition"
              >
                {t('howWorksLink')}
              </Link>
            </div>
          </div>
        </div>

        {/* LOGIN FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">
            {t('title')}
          </h3>
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
              spellCheck={false}
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
              spellCheck={false}
            />

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-[#81d742] underline hover:text-[#b3ffb3] transition"
                onClick={() => setShowForgot(true)}
              >
                {t('forgot')}
              </button>
            </div>

            {error && <div className="text-red-500 text-base text-center">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition"
            >
              {loading ? t('loggingIn') : t('loginBtn')}
            </button>
          </form>

          <div className="mt-6 text-gray-400 text-sm">
            {t('noAccount')}{" "}
            <Link href="/merchant/register" className="text-[#81d742] underline hover:text-[#b3ffb3]">
              {t('registerHere')}
            </Link>
          </div>
        </div>
      </div>

      {/* Şifremi Unuttum Modal */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#181818] rounded-xl shadow-xl p-8 max-w-sm w-full border border-[#232323] text-center">
            <h4 className="text-lg md:text-xl text-[#d1ffd0] font-bold mb-4">{t('forgot')}</h4>
            <div className="text-gray-300 text-base mb-6">{t('forgotSoon')}</div>
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
          .cabo-mobile-top-space { margin-top: 1em; }
          .cabo-mobile-bottom-space { margin-bottom: 1rem; }
        }
      `}</style>
    </PublicLayout>
  );
}
