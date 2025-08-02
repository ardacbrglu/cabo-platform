'use client';
import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';
import Link from "next/link";

const translations = {
  en: {
    heroTitleA: "Drop your link. ",
    heroTitleB: "Let the money flow.",
    heroDesc: "Cabo lets you earn by just sharing product links. When someone buys, cash is on the way.",
    loginBtn: "Start Earning Now",
  },
  tr: {
    heroTitleA: "Linkini bırak.",
    heroTitleB: "Kazanç akmaya başlasın.",
    heroDesc: "Cabo, sadece ürün linki paylaşarak para kazanmanı sağlar. Birileri satın aldığında para hesabına yatar.",
    loginBtn: "Hemen Kazanmaya Başla",
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
          <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto mb-6">
            {t("heroDesc")}
          </p>

          {/* LOGIN BUTTON */}
          <div className="flex justify-center mt-7">
            <Link
              href="/login"
              className="
                bg-[#81d742] 
                text-[#101010]
                hover:bg-[#baff7c]
                hover:text-[#121212]
                font-bold
                text-lg
                px-8 py-3
                rounded-xl
                shadow-md
                transition
                duration-200
                focus:outline-none
                focus:ring-2
                focus:ring-[#a2ff70]
                focus:ring-offset-2
                active:scale-95
                "
              style={{
                letterSpacing: "-0.01em",
                boxShadow: "0 4px 32px 0 rgba(129,215,66,0.08)"
              }}
            >
              {t("loginBtn")}
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
