'use client';

import PublicLayout from '@/components/PublicLayout';
import { useLocale } from '@/context/LocaleContext';

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
  }
};

export default function FAQPage() {
  const { locale, ready } = useLocale();
  if (!ready) return null;
  const t = (key) => translations[locale][key] || key;

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto py-16 px-6 sm:py-20 sm:px-8">
        <h2 className="text-4xl md:text-5xl font-extrabold text-[#d1ffd0] mb-16 text-center">
          {t("faqTitle")}
        </h2>

        <div className="space-y-16">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div key={n}>
              <h3 className="text-2xl md:text-3xl font-semibold text-[#81d742] mb-6">
                {t(`q${n}`)}
              </h3>
              <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-8">
                {t(`a${n}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
