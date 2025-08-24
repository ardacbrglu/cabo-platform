// src/app/terms/page.js
import PublicLayout from "@/components/PublicLayout";
import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Terms of Service | Cabo",
  description:
    "Affiliate platform terms of service. Şartlar ve Koşullar (TR/EN).",
};

const BRAND = "Cabo";
const COMPANY = "[Şirket Adı – Ticaret Unvanı]";           // TODO
const COMPANY_ADDR = "[Şirket Adresi, İl/İlçe, Türkiye]";  // TODO
const COMPANY_EMAIL = "legal@yourcompany.com";             // TODO
const GOVERNING_CITY = "İstanbul";                         // mahkeme yetkisi

function pickLang(searchParams) {
  const qp = String(searchParams?.lang || "").toLowerCase();
  if (qp.startsWith("tr") || qp === "tr") return "tr";
  const h = headers();
  const al = (h.get("accept-language") || "").toLowerCase();
  return al.startsWith("tr") ? "tr" : "en";
}

const DICT = {
  en: {
    lastUpdated: "Last updated",
    title: "Terms of Service",
    intro1: `${BRAND} is an affiliate platform that lets you promote products and earn commissions from participating merchants.`,
    intro2:
      `By creating an account or using the Services, you agree to these Terms.`,
    defsTitle: "Definitions",
    defs:
      `“Platform/Services” means the ${BRAND} website and related APIs; “Affiliate” means a user promoting merchant products; “Merchant” means the product owner; “Link” means your unique referral URL; “We/Us” means ${COMPANY}.`,
    eligibilityTitle: "Eligibility & Account",
    eligibilityList: [
      "You must be 18+ and have legal capacity under Turkish law.",
      "You are responsible for the accuracy of your registration data and keeping credentials secure.",
      "We may require identity checks to prevent fraud/abuse.",
    ],
    programTitle: "Program Mechanics",
    programList: [
      "You claim a product and receive a unique referral link.",
      "When a sale is attributed to your link, a commission is calculated per the merchant’s rules visible on the product card.",
      "We may void commissions for canceled/returned/fraudulent orders.",
      "We may update program rules and product availability at any time.",
    ],
    commissionTitle: "Commissions & Payouts",
    commissionList: [
      "Commissions accrue in your dashboard once sales are confirmed by the Merchant.",
      "Minimum payout thresholds, methods and schedules are shown in the dashboard.",
      "Payouts are made to your bank IBAN or other method you set.",
      "You are responsible for providing correct payout details; misdirected payments caused by wrong details are your risk.",
    ],
    taxTitle: "Taxes",
    taxText:
      "You are responsible for any taxes arising from earnings (e.g., income tax, VAT where applicable). We may request invoices/receipts or deduct statutory withholding if required by law.",
    prohibitedTitle: "Prohibited Conduct",
    prohibitedList: [
      "Misleading, deceptive or unlawful advertising.",
      "Spamming, cookie stuffing, self-referrals or fake clicks.",
      "Infringing intellectual property or violating platform/merchant policies.",
      "Any attempt to manipulate attribution or reporting.",
    ],
    ipTitle: "Intellectual Property",
    ipText:
      `The ${BRAND} Platform, logo and UI are our property. You receive a limited, revocable, non-exclusive license to use the Services. Merchant marks remain their respective owners’ property.`,
    privacyTitle: "Privacy",
    privacyText:
      `Your data is processed as described in our Privacy Policy. See `,
    merchantsTitle: "Merchants & Links",
    merchantsText:
      "Merchants are independent from us. We are not a party to sales contracts between you and merchants or merchants and buyers.",
    termTitle: "Suspension & Termination",
    termList: [
      "We may suspend or terminate your account for breach, fraud, or at our discretion with reasonable notice where feasible.",
      "You may close your account at any time. Unpaid confirmed commissions will be paid out according to the payout schedule unless obtained in breach of these Terms.",
    ],
    disclaimTitle: "Disclaimers",
    disclaimText:
      "Services are provided “as is”. We do not warrant uninterrupted or error-free operation or guaranteed earnings.",
    liabilityTitle: "Limitation of Liability",
    liabilityText:
      "To the maximum extent permitted by law, our aggregate liability is limited to the total commissions paid to you in the last 6 months preceding the event giving rise to liability.",
    indemnTitle: "Indemnity",
    indemnText:
      "You agree to indemnify us against claims arising from your illegal use, breach of these Terms, or violation of third-party rights.",
    lawTitle: "Governing Law & Venue",
    lawText:
      `These Terms are governed by Turkish law. ${GOVERNING_CITY} courts and enforcement offices have exclusive jurisdiction.`,
    changesTitle: "Changes",
    changesText:
      "We may update these Terms. Material changes will be announced on the Platform. Continued use means acceptance.",
    contactTitle: "Contact",
    contactText:
      `Data controller / operator: ${COMPANY}, ${COMPANY_ADDR}. Legal & compliance: ${COMPANY_EMAIL}.`,
    back: "Back",
    toPrivacy: "Read Privacy Policy",
  },
  tr: {
    lastUpdated: "Son güncelleme",
    title: "Şartlar ve Koşullar",
    intro1:
      `${BRAND}, satıcıların ürünlerini tanıtıp satışlardan komisyon kazanmanı sağlayan bir iş ortaklığı (affiliate) platformudur.`,
    intro2:
      "Hesap oluşturarak veya Hizmetleri kullanarak bu Şartları kabul etmiş olursun.",
    defsTitle: "Tanımlar",
    defs:
      `“Platform/Hizmetler” ${BRAND} internet sitesi ve ilgili arayüzlerdir; “Affiliate” ürünü tanıtan kullanıcıyı; “Satıcı” ürün sahibini; “Link” sana özel yönlendirme adresini; “Biz” ${COMPANY}’yi ifade eder.`,
    eligibilityTitle: "Uygunluk ve Hesap",
    eligibilityList: [
      "18+ olmalı ve Türk hukuku uyarınca fiil ehliyetine sahip olmalısın.",
      "Kayıt bilgilerinin doğruluğundan ve kimlik bilgilerini korumaktan sen sorumlusun.",
      "Dolandırıcılık/istismar önlemek için kimlik teyidi isteyebiliriz.",
    ],
    programTitle: "Program İşleyişi",
    programList: [
      "Bir ürünü sahiplendiğinde sana özel yönlendirme linki oluşur.",
      "Satış senin linkine atfedildiğinde, üründe görülen kurallara göre komisyon hesaplanır.",
      "İptal/iadelerde, sahte veya şüpheli işlemlerde komisyonlar iptal edilebilir.",
      "Program kuralları ve ürün uygunluğu herhangi bir zamanda güncellenebilir.",
    ],
    commissionTitle: "Komisyonlar ve Ödemeler",
    commissionList: [
      "Komisyonlar, Satıcı tarafından onaylanan satışlar için panelinde birikir.",
      "Minimum ödeme eşiği, yöntem ve periyotlar panelde duyurulur.",
      "Ödemeler IBAN’ına veya belirlediğin diğer yöntemlere yapılır.",
      "Yanlış ödeme bilgisi kaynaklı hatalı/yanlış yönlenen ödemelerden sen sorumlusun.",
    ],
    taxTitle: "Vergiler",
    taxText:
      "Kazançlarından doğan tüm vergiler (örn. gelir vergisi, gerektiğinde KDV) sana aittir. Kanunen gerekirse belge talep edebilir veya mevzuattaki stopaj yükümlülüklerini uygulayabiliriz.",
    prohibitedTitle: "Yasaklı Kullanımlar",
    prohibitedList: [
      "Aldatıcı, hukuka aykırı veya yanıltıcı reklam.",
      "Spam, cookie stuffing, kendi kendine yönlendirme, sahte tıklama.",
      "Fikri mülkiyet ihlali veya platform/satıcı politika ihlalleri.",
      "Atıf/raporlamayı manipüle etmeye yönelik her türlü girişim.",
    ],
    ipTitle: "Fikri Mülkiyet",
    ipText:
      `${BRAND} Platformu, logo ve arayüz bize aittir. Hizmetler için sınırlı, geri alınabilir, münhasır olmayan bir kullanım hakkı verilir. Satıcı işaretleri ilgili sahiplerine aittir.`,
    privacyTitle: "Gizlilik",
    privacyText:
      "Kişisel verilerin Gizlilik Politikamızda açıklandığı şekilde işlenir. Bkz. ",
    merchantsTitle: "Satıcılar ve Linkler",
    merchantsText:
      "Satıcılar bizden bağımsız üçüncü kişilerdir. Satın alma sözleşmelerinin tarafı değiliz.",
    termTitle: "Askıya Alma ve Fesih",
    termList: [
      "İhlal, dolandırıcılık vb. hallerde hesabını askıya alabilir veya feshedebiliriz; mümkün olduğunda makul bildirim yaparız.",
      "Hesabını istediğin an kapatabilirsin. İhlalle elde edilmemiş onaylı komisyonlar ödeme takvimine göre ödenir.",
    ],
    disclaimTitle: "Sorumluluk Reddi",
    disclaimText:
      "Hizmetler “olduğu gibi” sunulur. Kesintisiz/hatasız çalışma veya kazanç garantisi verilmez.",
    liabilityTitle: "Sorumluluğun Sınırlandırılması",
    liabilityText:
      "Mevzuatın izin verdiği azami ölçüde toplam sorumluluğumuz, sorumluluğa yol açan olaydan önceki 6 ayda sana ödenen toplam komisyonlarla sınırlıdır.",
    indemnTitle: "Tazmin",
    indemnText:
      "Bu Şartların ihlalinden, hukuka aykırı kullanımından veya üçüncü kişi haklarının ihlalinden doğan taleplere karşı bizi tazmin etmeyi kabul edersin.",
    lawTitle: "Uygulanacak Hukuk ve Yetkili Mahkeme",
    lawText:
      `Bu Şartlar Türk hukukuna tabidir. ${GOVERNING_CITY} mahkemeleri ve icra daireleri yetkilidir.`,
    changesTitle: "Değişiklikler",
    changesText:
      "Şartlar güncellenebilir. Önemli değişiklikler Platformda duyurulur. Kullanıma devam edilmesi kabul anlamına gelir.",
    contactTitle: "İletişim",
    contactText:
      `Veri sorumlusu/işleten: ${COMPANY}, ${COMPANY_ADDR}. Hukuk & uyum: ${COMPANY_EMAIL}.`,
    back: "Geri",
    toPrivacy: "Gizlilik Politikası’nı oku",
  },
};

export default function TermsPage({ searchParams }) {
  const lang = pickLang(searchParams);
  const t = (k) => (DICT[lang] || DICT.en)[k] || k;
  const L = (DICT[lang] || DICT.en);

  return (
    <PublicLayout>
      <main className="max-w-3xl mx-auto px-4 py-10 text-gray-300">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-[#d1ffd0]">
            {t("title")}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {t("lastUpdated")}: 24 Aug 2025 ·{" "}
            <Link
              href={`/privacy?lang=${lang}`}
              className="text-[#81d742] underline"
            >
              {t("toPrivacy")}
            </Link>
          </p>
        </div>

        <Section title="">
          <p>{t("intro1")}</p>
          <p className="mt-3">{t("intro2")}</p>
        </Section>

        <Section title={t("defsTitle")}>
          <p>{t("defs")}</p>
        </Section>

        <Section title={t("eligibilityTitle")}>
          <Ul items={L.eligibilityList} />
        </Section>

        <Section title={t("programTitle")}>
          <Ul items={L.programList} />
        </Section>

        <Section title={t("commissionTitle")}>
          <Ul items={L.commissionList} />
        </Section>

        <Section title={t("taxTitle")}>
          <p>{t("taxText")}</p>
        </Section>

        <Section title={t("prohibitedTitle")}>
          <Ul items={L.prohibitedList} />
        </Section>

        <Section title={t("ipTitle")}>
          <p>{t("ipText")}</p>
        </Section>

        <Section title={t("privacyTitle")}>
          <p>
            {t("privacyText")}
            <Link
              href={`/privacy?lang=${lang}`}
              className="text-[#81d742] underline"
            >
              Privacy
            </Link>
            .
          </p>
        </Section>

        <Section title={t("merchantsTitle")}>
          <p>{t("merchantsText")}</p>
        </Section>

        <Section title={t("termTitle")}>
          <Ul items={L.termList} />
        </Section>

        <Section title={t("disclaimTitle")}>
          <p>{t("disclaimText")}</p>
        </Section>

        <Section title={t("liabilityTitle")}>
          <p>{t("liabilityText")}</p>
        </Section>

        <Section title={t("indemnTitle")}>
          <p>{t("indemnText")}</p>
        </Section>

        <Section title={t("lawTitle")}>
          <p>{t("lawText")}</p>
        </Section>

        <Section title={t("changesTitle")}>
          <p>{t("changesText")}</p>
        </Section>

        <Section title={t("contactTitle")}>
          <p>{t("contactText")}</p>
        </Section>

        <div className="mt-10">
          <Link href="/" className="text-[#81d742] underline">
            ← {t("back")}
          </Link>
        </div>
      </main>
    </PublicLayout>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      {title ? (
        <h2 className="text-xl font-bold text-[#d1ffd0] mb-2">{title}</h2>
      ) : null}
      <div className="space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}
function Ul({ items = [] }) {
  return (
    <ul className="list-disc pl-6 space-y-2">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}
