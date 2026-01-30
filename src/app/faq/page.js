// app/faq/page.js
"use client";

// Amaç: SSS sayfası (erişilebilir, SEO dostu, JSON-LD ile zengin sonuç).
// Not: Tasarım yeni “card/surface” public style ile uyumlu, dış link yok.

import PublicLayout from "@/components/PublicLayout";
import { useLocale } from "@/context/LocaleContext";
import { useMemo } from "react";

const translations = {
  en: {
    faqTitle: "Frequently Asked Questions",
    q1: "What is Cabo?",
    a1: "Cabo is an affiliate platform where you earn real money by sharing product links. If someone buys via your link, your commission is instantly tracked and ready for payout.",
    q2: "How do I start earning?",
    a2: "Sign up, get your unique links from the Products section, and start sharing everywhere — Instagram, TikTok, WhatsApp, YouTube, Twitter, your blog, or wherever you want.",
    q3: "Do I get paid for clicks?",
    a3: "No fake clicks! You only earn when someone actually completes a real purchase using your link. This keeps the system fair and free from fraud.",
    q4: "Who can join Cabo?",
    a4: "Everyone! You don’t have to be an influencer or have followers. Cabo is perfect for students, creators, side-hustlers — anyone who wants to earn extra cash online.",
    q5: "How and when do I get paid?",
    a5: "When your balance reaches the minimum payout, simply request a payout from your Wallet. Payments are sent directly to your bank account, fast and secure.",
    q6: "Is there a cost to join?",
    a6: "No! Signing up and earning with Cabo is totally free. There are no hidden fees — just share and earn.",
    q7: "How do I maximize my earnings?",
    a7: "Promote trending products, use your social media, and keep your links visible. The more you share, the more you can earn. Easy.",
    contents: "Contents",
  },
  tr: {
    faqTitle: "Sık Sorulan Sorular",
    q1: "Cabo nedir?",
    a1: "Cabo, ürün linkleri paylaşarak gerçek para kazanabileceğin bir affiliate platformudur. Birileri senin linkinden alışveriş yaptığında, kazancın anında hesabında görünür.",
    q2: "Nasıl para kazanmaya başlarım?",
    a2: "Kayıt ol, Ürünler bölümünden kendine özel linklerini al ve istediğin her yerde paylaş — Instagram, TikTok, WhatsApp, YouTube, Twitter, blogun veya arkadaş grubunda.",
    q3: "Tıklama başına ödeme alır mıyım?",
    a3: "Fake tıklamaya son! Sadece biri gerçekten senin linkinden alışveriş yaparsa kazanırsın. Böylece sistem adil ve dolandırıcılığa kapalı kalır.",
    q4: "Kimler Cabo'ya katılabilir?",
    a4: "Herkes! Influencer olmana ya da takipçin olmasına gerek yok. Cabo öğrenciler, içerik üreticileri, ek gelir arayanlar ve online kazanç isteyen herkes için uygun.",
    q5: "Nasıl ve ne zaman ödeme alırım?",
    a5: "Bakiye limitine ulaştığında Cüzdanından ödemeni talep et. Para doğrudan banka hesabına hızlı ve güvenli şekilde yatırılır.",
    q6: "Üye olmak ücretli mi?",
    a6: "Hayır! Cabo'ya kayıt olmak ve kazanmak tamamen ücretsizdir. Gizli ücret yok, sadece paylaş ve kazan.",
    q7: "Daha fazla nasıl kazanırım?",
    a7: "Trend ürünleri öne çıkar, sosyal medyada ve çevrende sıkça paylaş. Ne kadar çok paylaşırsan, o kadar fazla kazanırsın. Bu kadar basit.",
    contents: "İçindekiler",
  },
};

const questionKeys = [1, 2, 3, 4, 5, 6, 7];

export default function FAQPage() {
  const { locale, ready } = useLocale();
  if (!ready) return null;

  const dict = translations[locale] || translations.en;
  const t = (key) => dict[key] || key;

  // JSON-LD (FAQPage) — zengin sonuçlar için
  const faqJsonLd = useMemo(() => {
    const mainEntity = questionKeys.map((n) => ({
      "@type": "Question",
      name: t(`q${n}`),
      acceptedAnswer: { "@type": "Answer", text: t(`a${n}`) },
    }));
    return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity };
  }, [dict]); // dict değişince yeniden üret

  return (
    <PublicLayout>
      <script
        id="faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 text-gray-200">
        {/* Header Card */}
        <div className="rounded-2xl border border-[#232323] bg-[#0f0f0f] shadow-[0_14px_50px_rgba(0,0,0,0.55)] p-6 md:p-7">
          <h1 className="text-3xl md:text-[34px] font-extrabold text-[#d1ffd0] tracking-tight text-center">
            {t("faqTitle")}
          </h1>

          {/* Contents */}
          <div className="mt-6 rounded-xl border border-[#232323] bg-[#101010] p-4">
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-3">
              {t("contents")}
            </div>
            <nav aria-label="FAQ contents">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-300">
                {questionKeys.map((n) => (
                  <li key={`toc-${n}`}>
                    <a
                      className="block rounded-lg px-3 py-2 border border-transparent hover:border-[#2b2b2b] hover:bg-[#121212] hover:text-[#b0f7a2] transition"
                      href={`#q${n}`}
                    >
                      {t(`q${n}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* Q/A Cards */}
        <div className="mt-6 space-y-6">
          {questionKeys.map((n) => (
            <section
              key={n}
              aria-labelledby={`q${n}`}
              className="rounded-2xl border border-[#232323] bg-[#0f0f0f] p-6 md:p-7"
            >
              <h2
                id={`q${n}`}
                className="text-xl md:text-2xl font-bold text-[#d1ffd0] mb-3 scroll-mt-24"
              >
                <span className="text-[#81d742] mr-2">Q{n}.</span>
                {t(`q${n}`)}
              </h2>

              <p className="text-base md:text-lg text-gray-300 leading-relaxed">
                {t(`a${n}`)}
              </p>
            </section>
          ))}
        </div>
      </main>
    </PublicLayout>
  );
}
