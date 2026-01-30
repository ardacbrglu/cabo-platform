// src/app/privacy/page.js
"use client";

import PublicLayout from "@/components/PublicLayout";
import Link from "next/link";
import { useMemo } from "react";
import { useLocale } from "@/context/LocaleContext";

const BRAND = "Cabo";
const COMPANY = "[Şirket Adı – Ticaret Unvanı]"; // TODO
const COMPANY_ADDR = "[Şirket Adresi, İl/İlçe, Türkiye]"; // TODO
const COMPANY_EMAIL = "kvkk@yourcompany.com"; // TODO
const DPO_EMAIL = "dpo@yourcompany.com"; // TODO

const DICT = {
  en: {
    lastUpdated: "Last updated",
    title: "Privacy Policy",
    intro: `${COMPANY} (“we”) operates the ${BRAND} platform. This policy explains how we process personal data as data controller under Turkish Law No. 6698 (KVKK) and applicable laws.`,
    controllerTitle: "Data Controller & Contact",
    controller: `${COMPANY}, ${COMPANY_ADDR}. For privacy requests: ${COMPANY_EMAIL}. For DPO/representative: ${DPO_EMAIL}.`,
    whatTitle: "Data We Process",
    whatList: [
      "Identity & contact: name, email, phone (if shared), IBAN & bank for payouts.",
      "Account data: username, password hash, language, currency.",
      "Affiliate workflow: claimed links, clicks, sales & payouts (including amounts, product, merchant).",
      "Logs & security: IP address, timestamps, user-agent, request IDs.",
      "Support messages you send to us.",
    ],
    basisTitle: "Purposes & Legal Bases",
    basisList: [
      "Provide the platform and your account – performance of a contract (KVKK Art. 5/2-c).",
      "Fraud prevention, security, analytics – legitimate interests (5/2-f).",
      "Legal obligations: accounting, tax, responding to authorities (5/2-ç).",
      "Marketing communications (if any) – based on your explicit consent (5/1).",
    ],
    cookiesTitle: "Cookies",
    cookies:
      "We use strictly necessary cookies (session/CSRF). Analytics/marketing cookies are used only with your consent where applicable.",
    shareTitle: "Sharing & Processors",
    shareList: [
      "Hosting and infrastructure providers (cloud, CDN).",
      "Email & notification providers for transactional emails.",
      "Payment/banking partners to execute payouts.",
      "Service providers for fraud prevention and logging.",
      "Authorities/courts when legally required.",
    ],
    xferTitle: "International Transfers",
    xfer:
      "If data is transferred abroad, we rely on KVKK mechanisms (adequacy, undertakings or explicit consent) and apply appropriate safeguards.",
    retainTitle: "Retention",
    retain:
      "We keep data as long as necessary: account data while active; logs typically 6–24 months; financial records per tax laws (usually 5–10 years).",
    securityTitle: "Security",
    security:
      "We apply reasonable technical and organizational measures (encryption in transit, access controls, least-privilege, monitoring).",
    rightsTitle: "Your Rights (KVKK Art. 11)",
    rightsList: [
      "Learn whether your data is processed; request information.",
      "Learn the purpose and whether used properly.",
      "Know third parties to whom data is transferred.",
      "Request correction/erasure and notification to third parties.",
      "Object to results against you arising from automated processing.",
      "Request compensation for damages due to unlawful processing.",
    ],
    applyTitle: "How to Apply",
    apply: `Send a signed request to our address or email us at ${COMPANY_EMAIL}. We respond as soon as possible and within legal time limits.`,
    childrenTitle: "Children",
    children:
      "The Services are not directed to persons under 18. We do not knowingly process children’s data.",
    changesTitle: "Changes",
    changes:
      "We may update this policy. Material changes will be announced on the Platform.",
    contactTitle: "Contact",
    contact: `Questions? Contact ${COMPANY_EMAIL}.`,
    back: "Back",
    toTerms: "Read Terms of Service",
  },

  tr: {
    lastUpdated: "Son güncelleme",
    title: "Gizlilik Politikası",
    intro: `${COMPANY} (“biz”), ${BRAND} platformunu işletmektedir. Bu politika, veri sorumlusu sıfatıyla 6698 sayılı KVKK ve ilgili mevzuat kapsamında kişisel verileri nasıl işlediğimizi açıklar.`,
    controllerTitle: "Veri Sorumlusu ve İletişim",
    controller: `${COMPANY}, ${COMPANY_ADDR}. KVKK başvuruları: ${COMPANY_EMAIL}. İrtibat kişisi/DPO: ${DPO_EMAIL}.`,
    whatTitle: "İşlediğimiz Veriler",
    whatList: [
      "Kimlik & iletişim: ad, e-posta, telefon (paylaşıldıysa), ödeme için IBAN ve banka bilgisi.",
      "Hesap verileri: kullanıcı adı, parola özeti, dil ve para birimi tercihleri.",
      "Affiliate akışı: sahiplendiğin linkler, tıklamalar, satışlar ve ödeme kayıtları (tutar, ürün, satıcı).",
      "Kayıtlar & güvenlik: IP adresi, zaman damgaları, kullanıcı aracı, istek/oturum kimlikleri.",
      "Bize ilettiğin destek mesajları.",
    ],
    basisTitle: "Amaçlar ve Hukuki Sebepler",
    basisList: [
      "Platformun sunulması ve hesabının işletilmesi – sözleşmenin kurulması/ifası (KVKK 5/2-c).",
      "Dolandırıcılık önleme, güvenlik ve analiz – meşru menfaat (5/2-f).",
      "Hukuki yükümlülükler: muhasebe, vergi, resmi makamlara yanıt (5/2-ç).",
      "Pazarlama iletileri (varsa) – açık rıza (5/1) ile.",
    ],
    cookiesTitle: "Çerezler",
    cookies:
      "Zorunlu çerezler (oturum/CSRF) kullanılır. Analitik/pazarlama çerezleri (varsa) yalnızca rızanla kullanılır.",
    shareTitle: "Aktarımlar ve Veri İşleyenler",
    shareList: [
      "Barındırma ve altyapı hizmet sağlayıcıları (bulut, CDN).",
      "E-posta ve bildirim servisleri (işlemsel e-postalar için).",
      "Ödemelerin gerçekleştirilmesi için bankacılık/ödeme ortakları.",
      "Kayıt/güvenlik ve dolandırıcılık önleme hizmetleri.",
      "Kanuni zorunluluk halinde resmi makamlar ve mahkemeler.",
    ],
    xferTitle: "Yurtdışı Aktarımlar",
    xfer:
      "Yurtdışına aktarım gerekirse KVKK’daki aktarım mekanizmalarından yararlanır ve uygun güvenceleri uygularız (uygunluk, taahhüt, açık rıza vb.).",
    retainTitle: "Saklama Süreleri",
    retain:
      "Veriler, amacın gerektirdiği süre boyunca saklanır: hesap verileri aktif oldukça; loglar tipik olarak 6–24 ay; mali kayıtlar vergi mevzuatı uyarınca (genellikle 5–10 yıl).",
    securityTitle: "Güvenlik",
    security:
      "Uygun teknik ve idari tedbirler uygularız (iletişimde şifreleme, erişim kontrolleri, asgari yetki, izleme vb.).",
    rightsTitle: "Hakların (KVKK md. 11)",
    rightsList: [
      "Kişisel verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme.",
      "Amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme.",
      "Yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme.",
      "Eksik/yanlış işlenmişse düzeltilmesini ve üçüncü kişilere bildirilmesini isteme.",
      "KVKK’ya aykırı işleme sebebiyle zararın giderilmesini talep etme.",
      "Otomatik işlemeden doğan aleyhe sonuçlara itiraz.",
    ],
    applyTitle: "Başvuru Usulü",
    apply: `Islak imzalı başvurunu adresimize iletebilir veya ${COMPANY_EMAIL} üzerinden e-posta gönderebilirsin. Yasal sürelerde yanıtlarız.`,
    childrenTitle: "Çocukların Verileri",
    children:
      "Hizmetler 18 yaş altına yönelik değildir; çocukların verilerini bilerek işlemeyiz.",
    changesTitle: "Değişiklikler",
    changes:
      "Bu politika güncellenebilir. Önemli değişiklikler Platform üzerinden duyurulur.",
    contactTitle: "İletişim",
    contact: `Soruların için: ${COMPANY_EMAIL}.`,
    back: "Geri",
    toTerms: "Şartlar ve Koşullar’ı oku",
  },
};

export default function PrivacyPage() {
  const { locale } = useLocale();

  const lang = useMemo(() => {
    const s = String(locale || "").toLowerCase();
    return s.startsWith("tr") ? "tr" : "en";
  }, [locale]);

  const L = DICT[lang] || DICT.en;
  const t = (k) => L[k] ?? k;

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 text-gray-200">
        {/* Header Card */}
        <div className="rounded-2xl border border-[#232323] bg-[#0f0f0f] shadow-[0_14px_50px_rgba(0,0,0,0.55)] p-6 md:p-7">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl md:text-[34px] font-extrabold text-[#d1ffd0] tracking-tight">
              {t("title")}
            </h1>

            <div className="text-sm text-gray-400">
              {t("lastUpdated")}: <span className="text-gray-300">24 Aug 2025</span>
              <span className="mx-2">·</span>
              <Link
                href="/terms"
                prefetch={false}
                className="text-[#81d742] underline decoration-[#2f5f2f] underline-offset-4 hover:opacity-90 transition"
              >
                {t("toTerms")}
              </Link>
            </div>

            <div className="mt-4 space-y-3 leading-relaxed text-gray-300">
              <p>{t("intro")}</p>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="mt-6 space-y-6">
          <Section title={t("controllerTitle")}>
            <p>{t("controller")}</p>
          </Section>

          <Section title={t("whatTitle")}>
            <Ul items={L.whatList} />
          </Section>

          <Section title={t("basisTitle")}>
            <Ul items={L.basisList} />
          </Section>

          <Section title={t("cookiesTitle")}>
            <p>{t("cookies")}</p>
          </Section>

          <Section title={t("shareTitle")}>
            <Ul items={L.shareList} />
          </Section>

          <Section title={t("xferTitle")}>
            <p>{t("xfer")}</p>
          </Section>

          <Section title={t("retainTitle")}>
            <p>{t("retain")}</p>
          </Section>

          <Section title={t("securityTitle")}>
            <p>{t("security")}</p>
          </Section>

          <Section title={t("rightsTitle")}>
            <Ul items={L.rightsList} />
          </Section>

          <Section title={t("applyTitle")}>
            <p>{t("apply")}</p>
          </Section>

          <Section title={t("childrenTitle")}>
            <p>{t("children")}</p>
          </Section>

          <Section title={t("changesTitle")}>
            <p>{t("changes")}</p>
          </Section>

          <Section title={t("contactTitle")}>
            <p>{t("contact")}</p>
          </Section>

          <div className="pt-4">
            <Link
              href="/"
              prefetch={false}
              className="text-[#81d742] underline decoration-[#2f5f2f] underline-offset-4 hover:opacity-90 transition"
            >
              ← {t("back")}
            </Link>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-[#232323] bg-[#0f0f0f] p-6 md:p-7">
      <h2 className="text-xl font-bold text-[#d1ffd0] mb-3">{title}</h2>
      <div className="space-y-3 leading-relaxed text-gray-300">{children}</div>
    </section>
  );
}

function Ul({ items = [] }) {
  return (
    <ul className="list-disc pl-6 space-y-2 text-gray-300">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}
