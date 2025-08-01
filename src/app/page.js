'use client';
import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';

const translations = {
  en: {
    heroTitleA: "Drop your link. ",
    heroTitleB: "Let the money flow.",
    heroDesc: "Cabo lets you earn by just sharing product links. When someone buys, cash is on the way.",
  },
  tr: {
    heroTitleA: "Drop your link. ",
    heroTitleB: "Let the money flow.",
    heroDesc: "Cabo, sadece ürün linki paylaşarak para kazanmanı sağlar. Birileri satın aldığında para hesabına yatar.",
  }
};

export default function Homepage() {
  const { locale, ready } = useLocale();
  if (!ready) return null;

  const t = (key) => translations[locale][key] || key;

  return (
    <PublicLayout>
      <div className="flex-grow flex items-center justify-center px-3 sm:px-6 min-h-[65vh]">
        <div className="max-w-4xl text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2 leading-tight sm:leading-[3.5rem]">
            <span className="text-[#d1ffd0]">{t("heroTitleA")}</span>
            <span className="text-[#81d742]">{t("heroTitleB")}</span>
          </h2>
          <p className="text-[#81d742] font-bold text-lg sm:text-xl tracking-tight mb-8 flex items-center justify-center gap-5">
            <span></span>
            <span></span>
          </p>
          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto">
            {t("heroDesc")}
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
