'use client';

import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';
import Link from 'next/link';

const translations = {
  en: {
    title: "Merchant Integration Guide",
    overviewTitle: "Why Integrate with Cabo?",
    overview:
      "With Cabo you can effortlessly list your products, reach thousands of affiliates, and only pay commissions on real sales. " +
      "Our simple webhook-based integration and HMAC validation ensure every purchase is genuine, so you can grow with confidence.",
    contactTitle: "Need Integration Help?",
    contact:
      "Our team is here to support your onboarding. Email us at " +
      "**integration@cabo.com**" +
      " and we’ll guide you step by step.",
    commissionTitle: "Customizable Commissions",
    commission:
      "You set your commission rate and decide how many sales per product are eligible. " +
      "Want to pause commissions? Simply deactivate the product in your Dashboard at any time.",
    securityTitle: "Secure & Transparent",
    security:
      "All events are logged in real time on your Dashboard. " +
      "HMAC‐signed callbacks, detailed analytics, and clear reporting mean you always know exactly which sales earned you commission.",
    nextStepsTitle: "Ready to Get Started?",
    nextSteps:
      "Head over to your Merchant Dashboard → Manage Products to add your first item, or contact us if you need help integrating.",
  },
  tr: {
    title: "Satıcı Entegrasyon Rehberi",
    overviewTitle: "Neden Cabo ile Entegre Olmalısınız?",
    overview:
      "Cabo ile ürünlerinizi kolayca listeleyin, binlerce affiliate’a ulaşın ve yalnızca gerçek satışlar için komisyon ödeyin. " +
      "Webhook tabanlı entegrasyonumuz ve HMAC doğrulaması, her işlem gerçeğe uygun olduğundan emin olur, böylece güvenle büyüyebilirsiniz.",
    contactTitle: "Entegrasyon Desteği Gerekli mi?",
    contact:
      "Onboarding sürecinizde yanınızdayız. Bize " +
      "**integration@cabo.com**" +
      " adresinden e-posta gönderin, size adım adım yardımcı olalım.",
    commissionTitle: "Özelleştirilebilir Komisyonlar",
    commission:
      "Komisyon oranınızı siz belirleyin ve ürün başına kaç satış için geçerli olacağını ayarlayın. " +
      "Komisyonları durdurmak mı istiyorsunuz? Dashboard’dan ürünü istediğiniz zaman devre dışı bırakabilirsiniz.",
    securityTitle: "Güvenli ve Şeffaf",
    security:
      "Tüm işlemler gerçek zamanlı olarak Dashboard’da kaydedilir. " +
      "HMAC imzalı callback’ler, detaylı analizler ve net raporlamalar sayesinde hangi satıştan ne kadar kazandığınızı her zaman bilirsiniz.",
    nextStepsTitle: "Başlamaya Hazır mısınız?",
    nextSteps:
      "Merchant Dashboard → Manage Products bölümüne giderek ilk ürününüzü ekleyin veya entegrasyon desteği için bize ulaşın.",
  }
};

export default function MerchantInfoPage() {
  const { locale, ready } = useLocale();
  if (!ready) return null;
  const t = (key) => translations[locale][key] || key;

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto py-16 px-6 sm:py-20 sm:px-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#d1ffd0] mb-16 text-center">
          {t('title')}
        </h1>

        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#81d742] mb-6">
            {t('overviewTitle')}
          </h2>
          <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
            {t('overview')}
          </p>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#81d742] mb-6">
            {t('contactTitle')}
          </h2>
          <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: t('contact') }} />
          </p>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#81d742] mb-6">
            {t('commissionTitle')}
          </h2>
          <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
            {t('commission')}
          </p>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#81d742] mb-6">
            {t('securityTitle')}
          </h2>
          <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
            {t('security')}
          </p>
        </section>

        <div className="text-center mt-12">
          <h2 className="text-2xl md:text-3xl font-semibold text-[#81d742] mb-6">
            {t('nextStepsTitle')}
          </h2>
          <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
            {t('nextSteps')}
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
