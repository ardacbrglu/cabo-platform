//Activated/page.js
'use client';
import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Çeviriler
const translations = {
  en: {
    activated: "Account Activated!",
    activatedMsg: "Your account is now active. Redirecting to login...",
    activatedNote: "You can now log in and start using Cabo.",
    failed: "Activation Failed",
    failedMsg: "Your activation link is invalid or expired.",
    failedNote: "Please try registering again or contact support if the issue persists."
  },
  tr: {
    activated: "Hesap Aktifleştirildi!",
    activatedMsg: "Hesabınız aktifleştirildi. Giriş sayfasına yönlendiriliyorsunuz...",
    activatedNote: "Artık giriş yapabilir ve Cabo'yu kullanmaya başlayabilirsiniz.",
    failed: "Aktivasyon Başarısız",
    failedMsg: "Aktivasyon linkiniz geçersiz veya süresi dolmuş.",
    failedNote: "Lütfen tekrar kayıt olun veya sorun devam ederse destekle iletişime geçin."
  }
};

export default function ActivatedPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { locale, ready } = useLocale();
  const t = (key) => translations[locale]?.[key] || translations.en[key];

  const isError = params.get("error");

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.push("/login");
    }, 3000);
    return () => clearTimeout(timeout);
  }, [router]);

  if (!ready) return null;

  return (
    <PublicLayout>
      <div className="flex flex-col justify-center items-center min-h-[60vh] text-white text-center px-6">
        {isError ? (
          <>
            <h1 className="text-3xl font-bold mb-4">{t('failed')}</h1>
            <p className="text-red-400 text-lg mb-4">{t('failedMsg')}</p>
            <p className="text-gray-400 text-sm">{t('failedNote')}</p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-4">{t('activated')}</h1>
            <p className="text-green-400 text-lg mb-4">{t('activatedMsg')}</p>
            <p className="text-gray-400 text-sm">{t('activatedNote')}</p>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
