"use client";

/**
 * Security Docblock (prod)
 * - Public page: no auth required.
 * - No secrets rendered; no user-specific data fetched client-side.
 * - No dangerouslySetInnerHTML.
 * - Full-bleed sections implemented to bypass PublicLayout "container" max-width.
 * - Images are loaded from /public (static) for best performance.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocale } from "@/context/LocaleContext";
import {
  Sparkles,
  ArrowDown,
  Link2,
  MousePointerClick,
  ShoppingCart,
  Wallet2,
  ChartNoAxesCombined,
  ShieldCheck,
  BadgeCheck,
  Copy,
  TrendingUp,
} from "lucide-react";

/* ---------- Inline dictionary (page-specific) ---------- */
const L = {
  en: {
    a11y_skip: "Skip to main content",

    hero_kicker: "Affiliate platform",
    heroTitleA: "Drop your link.",
    heroTitleB: " Let the money flow.",
    heroDesc:
      "Pick a product, generate a unique link, share it — and track clicks & confirmed sales in real time. When a purchase is confirmed, your commission becomes available to withdraw.",
    cta_affiliate: "Start earning",
    cta_register: "Create account",
    cta_merchant: "Merchant access",
    scroll_hint: "Scroll to explore",

    how_kicker: "How it works",
    how_titleA: "Simple on the surface,",
    how_titleB: " powerful underneath.",
    step1_title: "Get your link",
    step1_desc: "Choose a product. Cabo generates a unique tokenized link for you.",
    step2_title: "Copy & share",
    step2_desc: "Copy the link and share it anywhere — fast and frictionless.",
    step3_title: "Track live",
    step3_desc: "Clicks and confirmed sales are recorded with reliable tracking patterns.",
    step4_title: "Withdraw",
    step4_desc: "When you meet the threshold, request payout — clean and simple.",

    dash_kicker: "Dashboard",
    dash_titleA: "See earnings early,",
    dash_titleB: " stay motivated.",
    dash_desc:
      "A minimal dashboard that makes progress obvious: clicks, confirmed sales, net paid, and a wallet preview — all at a glance.",
    dash_img_label: "Drop screenshot: /public/screenshots/home/dashboard.png",

    products_kicker: "Products",
    products_titleA: "Pick a product.",
    products_titleB: " Copy. Share.",
    products_desc:
      "No complexity. Select a product from the marketplace, generate your link, and copy it in seconds.",
    products_img_label: "Drop screenshot: /public/screenshots/home/products.png",

    perf_kicker: "Performance",
    perf_titleA: "Track your sales",
    perf_titleB: " live.",
    perf_desc:
      "Understand what’s working: clicks vs confirmed sales, product-level performance, and trends — built for clarity.",
    perf_img_label: "Drop screenshot: /public/screenshots/home/performance.png",

    wallet_kicker: "Wallet",
    wallet_titleA: "Withdraw with",
    wallet_titleB: " confidence.",
    wallet_desc:
      "Clear payout readiness with minimum threshold and fee transparency — designed to feel effortless.",
    wallet_img_label: "Drop screenshot: /public/screenshots/home/wallet.png",

    trust_kicker: "Built for trust",
    trust_titleA: "Designed for",
    trust_titleB: " secure growth.",
    trust_desc:
      "Production-minded engineering patterns to protect users, tracking, and payouts — without slowing the product down.",
    pill1: "Role & status gates",
    pill2: "Rate limiting",
    pill3: "Audit-friendly logs",
    pill4: "Secure callbacks (HMAC)",
    pill5: "Strict headers",

    trust_c1_tag: "RBAC",
    trust_c1_title: "Access control for every protected action.",
    trust_c1_desc:
      "Sensitive routes require an authenticated session, correct role, and active status — no accidental exposure.",

    trust_c2_tag: "Protection",
    trust_c2_title: "Request IDs, rate limits, and safe defaults.",
    trust_c2_desc:
      "Every request can be traced via request IDs; abuse is reduced with user+IP limits and conservative caching.",

    trust_c3_tag: "Integrity",
    trust_c3_title: "Reliable tracking & verified events.",
    trust_c3_desc:
      "Purchase events can be verified via signed callbacks (HMAC-style) and recorded with audit logs for accountability.",

    shopify_kicker: "Shopify",
    shopify_titleA: "Our Shopify app",
    shopify_titleB: " is on the way.",
    shopify_desc:
      "We’re building a Shopify integration so merchants can connect stores faster and send secure purchase events back to Cabo.",

    final_titleA: "Ready to",
    final_titleB: " earn smarter?",
    final_desc:
      "Join Cabo as an affiliate or access the merchant portal to list products and track performance.",
    final_cta_primary: "Create / Login",
    final_cta_merchant: "Merchant Portal",
  },

  tr: {
    a11y_skip: "Ana içeriğe geç",

    hero_kicker: "Affiliate platformu",
    heroTitleA: "Linkini bırak.",
    heroTitleB: " Para aksın.",
    heroDesc:
      "Bir ürün seç, sana özel linkini oluştur, paylaş — tıklama ve onaylı satışları canlı takip et. Satış onaylanınca komisyonun çekime hazır olur.",
    cta_affiliate: "Kazanmaya başla",
    cta_register: "Hesap oluştur",
    cta_merchant: "Satıcı girişi",
    scroll_hint: "Keşfetmek için kaydır",

    how_kicker: "Nasıl çalışır?",
    how_titleA: "Yüzeyde basit,",
    how_titleB: " arkada güçlü.",
    step1_title: "Linkini al",
    step1_desc: "Bir ürün seç. Cabo sana özel token’lı link üretir.",
    step2_title: "Kopyala & paylaş",
    step2_desc: "Linki kopyala ve her yerde paylaş — hızlı ve zahmetsiz.",
    step3_title: "Canlı takip",
    step3_desc: "Tıklama ve onaylı satışlar güvenilir takip desenleriyle kaydedilir.",
    step4_title: "Çekim",
    step4_desc: "Eşiğe ulaştığında ödeme talep et — temiz ve basit.",

    dash_kicker: "Dashboard",
    dash_titleA: "Kazancı erken gör,",
    dash_titleB: " motive kal.",
    dash_desc:
      "Minimal panel: tıklama, onaylı satış, net ödenen ve wallet önizlemesi — tek bakışta.",
    dash_img_label: "Ekran görüntüsü: /public/screenshots/home/dashboard.png",

    products_kicker: "Ürünler",
    products_titleA: "Ürün seç.",
    products_titleB: " Kopyala. Paylaş.",
    products_desc:
      "Karmaşa yok. Marketplace’ten ürün seç, linkini üret ve saniyeler içinde kopyala.",
    products_img_label: "Ekran görüntüsü: /public/screenshots/home/products.png",

    perf_kicker: "Performans",
    perf_titleA: "Satışlarını",
    perf_titleB: " canlı izle.",
    perf_desc:
      "Ne işe yarıyor gör: tıklama vs onaylı satış, ürün bazlı performans ve trendler — netlik için tasarlandı.",
    perf_img_label: "Ekran görüntüsü: /public/screenshots/home/performance.png",

    wallet_kicker: "Wallet",
    wallet_titleA: "Güvenle",
    wallet_titleB: " çekim yap.",
    wallet_desc:
      "Minimum eşik ve platform ücreti şeffaflığıyla net ödeme uygunluğu — zahmetsiz hissetsin diye.",
    wallet_img_label: "Ekran görüntüsü: /public/screenshots/home/wallet.png",

    trust_kicker: "Güven için üretildi",
    trust_titleA: "Güvenli",
    trust_titleB: " büyüme için tasarlandı.",
    trust_desc:
      "Kullanıcıyı, takibi ve ödemeleri koruyan production desenleri — ürünü yavaşlatmadan.",
    pill1: "Rol & status kapıları",
    pill2: "Rate limiting",
    pill3: "Audit log uyumlu",
    pill4: "İmzalı callback (HMAC)",
    pill5: "Sıkı header’lar",

    trust_c1_tag: "RBAC",
    trust_c1_title: "Her kritik işlem için erişim kontrolü.",
    trust_c1_desc:
      "Korunan aksiyonlar oturum + doğru rol + active status ister — yanlış erişim riski azalır.",

    trust_c2_tag: "Koruma",
    trust_c2_title: "Request ID, rate limit ve güvenli varsayılanlar.",
    trust_c2_desc:
      "Her istek request-id ile izlenebilir; user+IP limitleri ve cache kontrolü ile abuse riski düşer.",

    trust_c3_tag: "Bütünlük",
    trust_c3_title: "Güvenilir takip & doğrulanmış olaylar.",
    trust_c3_desc:
      "Satın alma olayları imzalı callback (HMAC mantığı) ile doğrulanabilir; audit log’larla kayıt altına alınır.",

    shopify_kicker: "Shopify",
    shopify_titleA: "Shopify uygulamamız",
    shopify_titleB: " yakında.",
    shopify_desc:
      "Mağazaları daha hızlı bağlamak ve Cabo’ya güvenli satın alma event’leri göndermek için Shopify entegrasyonu geliştiriyoruz.",

    final_titleA: "Hazır mısın?",
    final_titleB: " Daha akıllı kazan.",
    final_desc:
      "Affiliate olarak katıl veya satıcı portalına girip ürünlerini listele ve performansı takip et.",
    final_cta_primary: "Kayıt / Giriş",
    final_cta_merchant: "Satıcı Portalı",
  },
};

/* ---------- helpers ---------- */
const cx = (...a) => a.filter(Boolean).join(" ");

function useRevealOnce(threshold = 0.16) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShow(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, show };
}

/**
 * Full-bleed section (fixes PublicLayout container width constraint)
 * - Always spans full viewport width inside any parent max-width container.
 * - min-h-screen ensures "full page length" feeling per section.
 */
function SectionShell({ tone = "dark", id, withTopBorder = false, children }) {
  const isDark = tone === "dark";
  return (
    <section
      id={id}
      className={cx(
        // full-bleed trick:
        "relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen",
        "min-h-screen flex items-center justify-center",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-white text-[#0b0b0b]",
        withTopBorder ? (isDark ? "border-t border-[#141414]" : "border-t border-[#e7e7e7]") : ""
      )}
    >
      <div className="w-full max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

const GradientWord = ({ children, className = "" }) => (
  <span
    className={cx(
      "bg-gradient-to-r from-[#ff7b7b] via-[#ffb36b] to-[#7cf7a6] bg-clip-text text-transparent",
      className
    )}
  >
    {children}
  </span>
);

const Kicker = ({ tone = "dark", icon, children }) => (
  <div
    className={cx(
      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-mono tracking-wide",
      tone === "dark"
        ? "bg-[#111] border border-[#1e1e1e] text-[#cfcfcf]"
        : "bg-[#fafafa] border border-[#e5e5e5] text-[#444]"
    )}
  >
    {icon}
    <span>{children}</span>
  </div>
);

const SoftCard = ({ tone = "dark", className = "", children }) => (
  <div
    className={cx(
      "rounded-2xl border",
      tone === "dark"
        ? "bg-[#141414] border-[#202020] shadow-[0_18px_60px_rgba(0,0,0,.45)]"
        : "bg-white border-[#e7e7e7] shadow-[0_18px_60px_rgba(0,0,0,.08)]",
      className
    )}
  >
    {children}
  </div>
);

const Pill = ({ tone = "dark", children }) => (
  <span
    className={cx(
      "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-mono",
      tone === "dark"
        ? "bg-[#101010] border border-[#252525] text-[#d8d8d8]"
        : "bg-[#f8f8f8] border border-[#e6e6e6] text-[#222]"
    )}
  >
    {children}
  </span>
);

function ImageSlot({ tone = "dark", src, alt, label }) {
  const [ok, setOk] = useState(true);

  return (
    <div
      className={cx(
        "rounded-3xl border overflow-hidden",
        tone === "dark" ? "border-[#1f1f1f] bg-[#0f0f0f]" : "border-[#efefef] bg-white"
      )}
    >
      {ok ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={cx("w-full h-auto block", tone === "dark" ? "opacity-95" : "opacity-100")}
          onError={() => setOk(false)}
        />
      ) : (
        <div className={cx("p-10 text-center", tone === "dark" ? "bg-[#0b0b0b]" : "bg-white")}>
          <div className={cx("text-[12px] font-mono", tone === "dark" ? "text-gray-300" : "text-gray-700")}>
            {label}
          </div>
          <div className={cx("mt-2 text-[11px] font-mono", tone === "dark" ? "text-gray-500" : "text-gray-500")}>
            {src}
          </div>
        </div>
      )}
    </div>
  );
}

/* Monochrome Shopify mark (keeps your palette clean) */
function ShopifyMark({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path
        d="M6.2 7.4c.3-.9.8-1.8 1.5-2.4.7-.7 1.6-1.1 2.6-1.1h3.2c1 0 1.9.4 2.6 1.1.7.6 1.2 1.5 1.5 2.4l1 3.1c.2.7.2 1.5-.1 2.2l-2 6c-.3 1-1.3 1.7-2.4 1.7H9.5c-1.1 0-2.1-.7-2.4-1.7l-2-6c-.2-.7-.2-1.5-.1-2.2l1.2-3.1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.9"
      />
      <path
        d="M9 9.3c0-1.7 1.3-3 3-3s3 1.3 3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- page ---------- */
export default function Homepage() {
  const { t } = useTranslation();
  const { locale = "en" } = useLocale() || {};

  const lt = useMemo(() => {
    const dict = L[locale] || L.en;
    return (key) => dict[key] ?? t(key) ?? key;
  }, [locale, t]);

  // Example numbers (premium vibe / "money is real" early)
  const example = {
    clicks: 1284,
    sales: 38,
    netPaid: 4929.0,
    confirmed: 5661.55,
    minPayout: 250,
    platformFee: 12,
    progressPct: 64,
  };

  const hero = useRevealOnce();
  const how = useRevealOnce();
  const dash = useRevealOnce();
  const products = useRevealOnce();
  const perf = useRevealOnce();
  const wallet = useRevealOnce();
  const trust = useRevealOnce();
  const shopify = useRevealOnce();
  const final = useRevealOnce();

  return (
    <PublicLayout>
      {/* Skip link (a11y) */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:bg-[#1a1a1a] focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:z-50"
      >
        {lt("a11y_skip")}
      </a>

      <main id="main" role="main" className="w-full scroll-smooth">
        {/* HERO (dark) */}
        <SectionShell tone="dark" id="top">
          <div
            ref={hero.ref}
            className={cx(
              "grid gap-10 items-center",
              "md:grid-cols-[1.2fr_.8fr]",
              "transition-all duration-700",
              hero.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="text-center md:text-left">
              <Kicker tone="dark" icon={<Sparkles className="w-4 h-4 text-[#81d742]" />}>
                {lt("hero_kicker")}
              </Kicker>

              <h1 className="mt-4 text-[36px] sm:text-[48px] md:text-[58px] leading-[1.05] font-extrabold tracking-tight">
                <span className="text-[#d1ffd0]">{lt("heroTitleA")}</span>
                <span className="text-[#81d742]">{lt("heroTitleB")}</span>
              </h1>

              <p className="mt-4 text-[15px] sm:text-[17px] text-gray-400 max-w-xl mx-auto md:mx-0">
                {lt("heroDesc")}
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center md:justify-start">
                <Link
                  href="/login"
                  prefetch={false}
                  className="
                    bg-[#81d742] text-[#0d0d0d] hover:bg-[#baff7c]
                    font-bold text-[15px] px-6 py-3 rounded-xl
                    transition duration-200 active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-[#a2ff70]
                    focus:ring-offset-2 focus:ring-offset-[#0b0b0b]
                  "
                  style={{ boxShadow: "0 10px 40px rgba(129,215,66,.12)" }}
                >
                  {lt("cta_affiliate")}
                </Link>

                <Link
                  href="/register"
                  prefetch={false}
                  className="
                    bg-transparent text-[#d1ffd0]
                    border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#141414]
                    font-semibold text-[15px] px-6 py-3 rounded-xl
                    transition duration-200 active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-[#2f4]
                    focus:ring-offset-2 focus:ring-offset-[#0b0b0b]
                  "
                >
                  {lt("cta_register")}
                </Link>

                <Link
                  href="/merchant/login"
                  prefetch={false}
                  className="text-gray-300 hover:text-white transition text-[13px] font-mono underline underline-offset-4 self-center"
                >
                  {lt("cta_merchant")}
                </Link>
              </div>

              <div className="mt-8 flex items-center justify-center md:justify-start gap-2 text-[11px] font-mono text-gray-500">
                <ArrowDown className="w-4 h-4" />
                <span>{lt("scroll_hint")}</span>
              </div>
            </div>

            {/* Right: premium preview mock (with real-looking numbers) */}
            <div className="relative">
              <div className="absolute -inset-6 blur-3xl opacity-30 bg-gradient-to-br from-[#81d742] via-[#ff8a6b] to-[#6be0ff]" />
              <SoftCard tone="dark" className="relative p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-mono text-gray-400">Cabo</div>
                  <div className="text-[11px] font-mono text-gray-500">Preview</div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    {
                      icon: <MousePointerClick className="w-4 h-4" />,
                      label: "Clicks",
                      value: String(example.clicks),
                    },
                    {
                      icon: <ShoppingCart className="w-4 h-4" />,
                      label: "Sales",
                      value: String(example.sales),
                    },
                    {
                      icon: <ChartNoAxesCombined className="w-4 h-4" />,
                      label: "Net Paid",
                      value: `₺${example.netPaid.toFixed(2)}`,
                    },
                  ].map((x, i) => (
                    <div key={i} className="rounded-xl border border-[#222] bg-[#121212] px-3 py-3">
                      <div className="text-gray-300">{x.icon}</div>
                      <div className="mt-2 text-[13px] font-extrabold font-mono text-white leading-none">
                        {x.value}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-gray-500">{x.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-[#222] bg-[#101010] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-mono text-[#d1ffd0]">Wallet</div>
                    <div className="text-[11px] font-mono text-gray-500">Confirmed</div>
                  </div>

                  <div className="mt-2 text-[24px] font-extrabold font-mono text-[#d1ffd0]">
                    ₺{example.confirmed.toFixed(2)}
                  </div>

                  <div className="mt-1 text-[11px] font-mono text-gray-500">
                    Min payout • Platform fee{" "}
                    <span className="text-[#81d742] font-semibold">₺{example.minPayout}</span>{" "}
                    <span className="text-[#e3d67d] font-semibold">%{example.platformFee}</span>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-[#1b1b1b] overflow-hidden">
                    <div className="h-full bg-[#81d742]" style={{ width: `${example.progressPct}%` }} />
                  </div>
                </div>

                <div className="mt-4 text-[11px] font-mono text-gray-500">
                  Premium, minimal, and made to feel effortless — because earning should be simple.
                </div>
              </SoftCard>
            </div>
          </div>
        </SectionShell>

        {/* HOW (light) — stays here (no extra "how it works" section elsewhere) */}
        <SectionShell tone="light" id="how" withTopBorder>
          <div
            ref={how.ref}
            className={cx(
              "transition-all duration-700",
              how.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="text-center">
              <Kicker tone="light" icon={<Link2 className="w-4 h-4 text-[#111]" />}>
                {lt("how_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[42px] font-extrabold tracking-tight">
                <span>{lt("how_titleA")} </span>
                <GradientWord>{lt("how_titleB")}</GradientWord>
              </h2>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {[
                { icon: <Link2 className="w-5 h-5" />, title: lt("step1_title"), desc: lt("step1_desc") },
                { icon: <Copy className="w-5 h-5" />, title: lt("step2_title"), desc: lt("step2_desc") },
                { icon: <TrendingUp className="w-5 h-5" />, title: lt("step3_title"), desc: lt("step3_desc") },
                { icon: <Wallet2 className="w-5 h-5" />, title: lt("step4_title"), desc: lt("step4_desc") },
              ].map((s, i) => (
                <SoftCard key={i} tone="light" className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[#0b0b0b] text-white p-3">{s.icon}</div>
                    <div>
                      <div className="text-[14px] font-extrabold">{s.title}</div>
                      <div className="mt-1 text-[13px] text-[#444] leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                </SoftCard>
              ))}
            </div>

            <div className="mt-10 flex justify-center">
              <div className="inline-flex items-center gap-2 text-[11px] font-mono text-[#555]">
                <ArrowDown className="w-4 h-4" />
                <span>{lt("scroll_hint")}</span>
              </div>
            </div>
          </div>
        </SectionShell>

        {/* DASHBOARD (dark) — screenshot + copy */}
        <SectionShell tone="dark" id="dashboard" withTopBorder>
          <div
            ref={dash.ref}
            className={cx(
              "grid md:grid-cols-12 gap-6 items-center transition-all duration-700",
              dash.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="md:col-span-5">
              <Kicker tone="dark" icon={<ChartNoAxesCombined className="w-4 h-4 text-[#81d742]" />}>
                {lt("dash_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span className="text-white">{lt("dash_titleA")}</span>{" "}
                <GradientWord>{lt("dash_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-gray-400 max-w-xl">
                {lt("dash_desc")}
              </p>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { label: "Clicks", value: example.clicks, icon: <MousePointerClick className="w-4 h-4" /> },
                  { label: "Sales", value: example.sales, icon: <ShoppingCart className="w-4 h-4" /> },
                  { label: "Wallet", value: `₺${example.confirmed.toFixed(2)}`, icon: <Wallet2 className="w-4 h-4" /> },
                ].map((x, i) => (
                  <div key={i} className="rounded-2xl border border-[#202020] bg-[#101010] p-4">
                    <div className="text-gray-400">{x.icon}</div>
                    <div className="mt-2 text-white font-mono font-extrabold text-[14px] leading-none">
                      {x.value}
                    </div>
                    <div className="mt-1 text-gray-500 font-mono text-[11px]">{x.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-7">
              <ImageSlot
                tone="dark"
                src="/screenshots/home/dashboard.png"
                alt="Cabo dashboard screenshot"
                label={lt("dash_img_label")}
              />
            </div>
          </div>
        </SectionShell>

        {/* PRODUCTS (light) */}
        <SectionShell tone="light" id="products" withTopBorder>
          <div
            ref={products.ref}
            className={cx(
              "grid md:grid-cols-12 gap-6 items-center transition-all duration-700",
              products.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="md:col-span-7">
              <ImageSlot
                tone="light"
                src="/screenshots/home/products.png"
                alt="Cabo products screenshot"
                label={lt("products_img_label")}
              />
            </div>

            <div className="md:col-span-5">
              <Kicker tone="light" icon={<Link2 className="w-4 h-4 text-[#111]" />}>
                {lt("products_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("products_titleA")} </span>
                <GradientWord>{lt("products_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-xl">
                {lt("products_desc")}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Pill tone="light">Select product</Pill>
                <Pill tone="light">Generate link</Pill>
                <Pill tone="light">Copy & share</Pill>
              </div>
            </div>
          </div>
        </SectionShell>

        {/* PERFORMANCE (dark) */}
        <SectionShell tone="dark" id="performance" withTopBorder>
          <div
            ref={perf.ref}
            className={cx(
              "grid md:grid-cols-12 gap-6 items-center transition-all duration-700",
              perf.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="md:col-span-5">
              <Kicker tone="dark" icon={<TrendingUp className="w-4 h-4 text-[#81d742]" />}>
                {lt("perf_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span className="text-white">{lt("perf_titleA")}</span>{" "}
                <GradientWord>{lt("perf_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-gray-400 max-w-xl">
                {lt("perf_desc")}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Pill tone="dark">Clicks vs Sales</Pill>
                <Pill tone="dark">Product filters</Pill>
                <Pill tone="dark">Instant insights</Pill>
              </div>
            </div>

            <div className="md:col-span-7">
              <ImageSlot
                tone="dark"
                src="/screenshots/home/performance.png"
                alt="Cabo performance screenshot"
                label={lt("perf_img_label")}
              />
            </div>
          </div>
        </SectionShell>

        {/* WALLET (light) */}
        <SectionShell tone="light" id="wallet" withTopBorder>
          <div
            ref={wallet.ref}
            className={cx(
              "grid md:grid-cols-12 gap-6 items-center transition-all duration-700",
              wallet.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="md:col-span-7">
              <ImageSlot
                tone="light"
                src="/screenshots/home/wallet.png"
                alt="Cabo wallet screenshot"
                label={lt("wallet_img_label")}
              />
            </div>

            <div className="md:col-span-5">
              <Kicker tone="light" icon={<Wallet2 className="w-4 h-4 text-[#111]" />}>
                {lt("wallet_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("wallet_titleA")} </span>
                <GradientWord>{lt("wallet_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-xl">
                {lt("wallet_desc")}
              </p>

              <SoftCard tone="light" className="mt-6 p-5">
                <div className="text-[11px] font-mono text-gray-500">Confirmed available</div>
                <div className="mt-1 text-[26px] font-extrabold font-mono text-[#0b0b0b]">
                  ₺{example.confirmed.toFixed(2)}
                </div>
                <div className="mt-2 text-[11px] font-mono text-gray-500">
                  Min payout <span className="font-semibold text-[#111]">₺{example.minPayout}</span> • Platform fee{" "}
                  <span className="font-semibold text-[#111]">%{example.platformFee}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[#ececec] overflow-hidden">
                  <div className="h-full bg-[#81d742]" style={{ width: `${example.progressPct}%` }} />
                </div>
              </SoftCard>
            </div>
          </div>
        </SectionShell>

        {/* TRUST / SECURITY (light) */}
        <SectionShell tone="light" id="trust" withTopBorder>
          <div
            ref={trust.ref}
            className={cx(
              "transition-all duration-700",
              trust.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="text-center">
              <Kicker tone="light" icon={<ShieldCheck className="w-4 h-4 text-[#111]" />}>
                {lt("trust_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("trust_titleA")} </span>
                <GradientWord>{lt("trust_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-2xl mx-auto">
                {lt("trust_desc")}
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-2">
                <Pill tone="light">{lt("pill1")}</Pill>
                <Pill tone="light">{lt("pill2")}</Pill>
                <Pill tone="light">{lt("pill3")}</Pill>
                <Pill tone="light">{lt("pill4")}</Pill>
                <Pill tone="light">{lt("pill5")}</Pill>
              </div>
            </div>

            <div className="mt-10 grid md:grid-cols-3 gap-4">
              {[
                {
                  tag: lt("trust_c1_tag"),
                  title: lt("trust_c1_title"),
                  desc: lt("trust_c1_desc"),
                },
                {
                  tag: lt("trust_c2_tag"),
                  title: lt("trust_c2_title"),
                  desc: lt("trust_c2_desc"),
                },
                {
                  tag: lt("trust_c3_tag"),
                  title: lt("trust_c3_title"),
                  desc: lt("trust_c3_desc"),
                },
              ].map((c, i) => (
                <SoftCard key={i} tone="light" className="p-5">
                  <div className="text-[12px] font-mono text-[#666]">{c.tag}</div>
                  <div className="mt-2 text-[14px] font-extrabold text-[#0b0b0b] leading-snug">
                    {c.title}
                  </div>
                  <div className="mt-2 text-[13px] text-[#444] leading-relaxed">{c.desc}</div>
                </SoftCard>
              ))}
            </div>
          </div>
        </SectionShell>

        {/* SHOPIFY (dark) */}
        <SectionShell tone="dark" id="shopify" withTopBorder>
          <div
            ref={shopify.ref}
            className={cx(
              "grid md:grid-cols-12 gap-6 items-center transition-all duration-700",
              shopify.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="md:col-span-7">
              <Kicker tone="dark" icon={<ShopifyMark className="w-4 h-4 text-[#81d742]" />}>
                {lt("shopify_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span className="text-white">{lt("shopify_titleA")} </span>
                <GradientWord>{lt("shopify_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-gray-400 max-w-2xl">
                {lt("shopify_desc")}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Pill tone="dark">Store connection</Pill>
                <Pill tone="dark">Signed events</Pill>
                <Pill tone="dark">Fast onboarding</Pill>
              </div>
            </div>

            <div className="md:col-span-5">
              <SoftCard tone="dark" className="p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-mono text-[#d1ffd0] inline-flex items-center gap-2">
                    <ShopifyMark className="w-4 h-4 text-[#81d742]" />
                    Shopify integration
                  </div>
                  <div className="text-[11px] font-mono text-gray-500">On the way</div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#202020] bg-[#101010] p-4">
                  <div className="text-[11px] font-mono text-gray-500">What it unlocks</div>
                  <div className="mt-3 space-y-2">
                    {[
                      "Connect Shopify stores quickly",
                      "Secure purchase callbacks back to Cabo",
                      "Cleaner merchant onboarding",
                    ].map((x, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[11px] font-mono border border-[#1f1f1f] bg-[#121212] rounded-xl px-3 py-2"
                      >
                        <BadgeCheck className="w-4 h-4 text-[#81d742]" />
                        <span className="text-gray-300">{x}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 text-[11px] font-mono text-gray-500">
                  (This section is informational — your real app flow stays secure & verified.)
                </div>
              </SoftCard>
            </div>
          </div>
        </SectionShell>

        {/* FINAL CTA (dark) */}
        <SectionShell tone="dark" id="final" withTopBorder>
          <div
            ref={final.ref}
            className={cx(
              "transition-all duration-700 text-center",
              final.show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <h2 className="text-[28px] sm:text-[48px] font-extrabold tracking-tight">
              <span className="text-white">{lt("final_titleA")} </span>
              <GradientWord>{lt("final_titleB")}</GradientWord>
            </h2>

            <p className="mt-4 text-gray-400 max-w-2xl mx-auto text-[14px] sm:text-[16px]">
              {lt("final_desc")}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/register"
                prefetch={false}
                className="
                  bg-[#81d742] text-[#0d0d0d] hover:bg-[#baff7c]
                  font-bold text-[15px] px-7 py-3 rounded-xl
                  transition duration-200 active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-[#a2ff70]
                  focus:ring-offset-2 focus:ring-offset-[#0b0b0b]
                "
                style={{ boxShadow: "0 10px 40px rgba(129,215,66,.12)" }}
              >
                {lt("final_cta_primary")}
              </Link>

              <Link
                href="/merchant/login"
                prefetch={false}
                className="
                  bg-transparent text-[#d1ffd0]
                  border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#141414]
                  font-semibold text-[15px] px-7 py-3 rounded-xl
                  transition duration-200 active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-[#2f4]
                  focus:ring-offset-2 focus:ring-offset-[#0b0b0b]
                "
              >
                {lt("final_cta_merchant")}
              </Link>
            </div>
          </div>
        </SectionShell>
      </main>
    </PublicLayout>
  );
}
