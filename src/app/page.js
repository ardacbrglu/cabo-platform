"use client";

/**
 * Homepage — FULL (PROD)
 *
 * Fixes:
 * - Desktop spacing: image/text no longer feels tight (bigger gaps + column padding).
 * - Strict alternation: dark/light/dark/light... while scrolling.
 * - Remove useTranslation dependency to avoid possible async timeouts (UnhandledRejection/Timeout).
 * - Shopify note rewritten to a meaningful, professional disclaimer.
 *
 * Security Docblock (prod)
 * - Public page: no auth required.
 * - No secrets rendered; no user-specific data fetched client-side.
 * - No dangerouslySetInnerHTML.
 * - Images are loaded from /public (static).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";
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
    hero_note:
      "Premium, minimal, and made to feel effortless — because earning should be simple.",

    // how
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

    // sections
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
    shopify_note:
      "Note: When available, purchase events will be accepted only if they are signed/verified — so commissions are credited only for valid transactions.",
    shopify_card_title: "Shopify integration",
    shopify_status: "On the way",
    shopify_unlock_title: "What it unlocks",
    shopify_unlock_1: "Connect Shopify stores quickly",
    shopify_unlock_2: "Secure purchase callbacks back to Cabo",
    shopify_unlock_3: "Cleaner merchant onboarding",

    final_titleA: "Ready to",
    final_titleB: " earn smarter?",
    final_desc:
      "Join Cabo as an affiliate or access the merchant portal to list products and track performance.",
    final_cta_primary: "Create / Login",
    final_cta_merchant: "Merchant Portal",

    // small labels
    ui_preview: "Preview",
    ui_clicks: "Clicks",
    ui_sales: "Sales",
    ui_net_paid: "Net Paid",
    ui_wallet: "Wallet",
    ui_confirmed: "Confirmed",
    ui_min_payout: "Min payout",
    ui_platform_fee: "Platform fee",
    ui_confirmed_available: "Confirmed available",

    // pills
    pill_select_product: "Select product",
    pill_generate_link: "Generate link",
    pill_copy_share: "Copy & share",
    pill_clicks_sales: "Clicks vs Sales",
    pill_product_filters: "Product filters",
    pill_instant_insights: "Instant insights",
    pill_store_connection: "Store connection",
    pill_signed_events: "Signed events",
    pill_fast_onboarding: "Fast onboarding",
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
    hero_note:
      "Premium, minimal ve zahmetsiz hissettirecek şekilde — çünkü kazanmak basit olmalı.",

    // how
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

    // sections
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
    shopify_note:
      "Not: Yayına alındığında, satın alma bildirimleri yalnızca imzalı/doğrulanmış şekilde kabul edilir — böylece komisyon sadece geçerli işlemlerde yazılır.",
    shopify_card_title: "Shopify entegrasyonu",
    shopify_status: "Yakında",
    shopify_unlock_title: "Ne sağlar?",
    shopify_unlock_1: "Shopify mağazasını hızlı bağlama",
    shopify_unlock_2: "Cabo’ya güvenli satın alma callback’leri",
    shopify_unlock_3: "Daha temiz merchant onboarding",

    final_titleA: "Hazır mısın?",
    final_titleB: " Daha akıllı kazan.",
    final_desc:
      "Affiliate olarak katıl veya satıcı portalına girip ürünlerini listele ve performansı takip et.",
    final_cta_primary: "Kayıt / Giriş",
    final_cta_merchant: "Satıcı Portalı",

    // small labels
    ui_preview: "Önizleme",
    ui_clicks: "Tıklama",
    ui_sales: "Satış",
    ui_net_paid: "Net Ödenen",
    ui_wallet: "Wallet",
    ui_confirmed: "Onaylı",
    ui_min_payout: "Min. çekim",
    ui_platform_fee: "Platform ücreti",
    ui_confirmed_available: "Çekilebilir onaylı",

    // pills
    pill_select_product: "Ürün seç",
    pill_generate_link: "Link üret",
    pill_copy_share: "Kopyala & paylaş",
    pill_clicks_sales: "Tıklama vs Satış",
    pill_product_filters: "Ürün filtreleri",
    pill_instant_insights: "Anında içgörü",
    pill_store_connection: "Mağaza bağlantısı",
    pill_signed_events: "İmzalı event’ler",
    pill_fast_onboarding: "Hızlı onboarding",
  },
};

/* ---------- helpers ---------- */
const cx = (...a) => a.filter(Boolean).join(" ");

/**
 * Reveal: never hides content.
 * Only adds a subtle animation once when the element first enters viewport.
 * (No fallback timers to avoid any weird "timeout" behavior in devtools.)
 */
function useRevealOnce({ threshold = 0.12, rootMargin = "0px 0px -12% 0px", immediate = false } = {}) {
  const ref = useRef(null);
  const [reveal, setReveal] = useState(immediate);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        setReveal(true);
        return;
      }
    } catch {}

    if (immediate) {
      setReveal(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setReveal(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setReveal(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin }
    );

    io.observe(el);
    return () => {
      try {
        io.disconnect();
      } catch {}
    };
  }, [threshold, rootMargin, immediate]);

  return { ref, reveal };
}

function Reveal({ children, className = "", immediate = false, delay = 0 }) {
  const r = useRevealOnce({ immediate });
  const base = "will-change-[opacity,transform] transition-none";
  const animated = r.reveal ? "cabo-reveal-in" : "";
  const style = delay ? { animationDelay: `${delay}ms` } : undefined;

  return (
    <div ref={r.ref} style={style} className={cx(base, animated, className)}>
      {children}
    </div>
  );
}

/**
 * Full-bleed section:
 * - Spans full viewport width inside PublicLayout container
 * - min-h-screen for that "page by page" feel
 * - larger vertical padding for premium spacing
 */
function SectionShell({ tone = "dark", id, withTopBorder = false, children }) {
  const isDark = tone === "dark";
  return (
    <section
      id={id}
      className={cx(
        "relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen",
        "min-h-screen flex items-center justify-center",
        isDark ? "bg-[#0b0b0b] text-white" : "bg-white text-[#0b0b0b]",
        withTopBorder ? (isDark ? "border-t border-[#141414]" : "border-t border-[#e7e7e7]") : ""
      )}
    >
      <div className="w-full max-w-7xl px-4 sm:px-6 lg:px-10 py-14 sm:py-20">{children}</div>
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

/**
 * Square screenshot slot
 */
function ImageSlotSquare({ tone = "dark", src, alt, label }) {
  const [ok, setOk] = useState(true);

  return (
    <div
      className={cx(
        "rounded-3xl border overflow-hidden",
        tone === "dark" ? "border-[#1f1f1f] bg-[#0f0f0f]" : "border-[#efefef] bg-white",
        "shadow-[0_22px_70px_rgba(0,0,0,0.22)]"
      )}
    >
      <div className="relative aspect-square w-full">
        {ok ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className={cx(
              "absolute inset-0 w-full h-full object-cover block",
              tone === "dark" ? "opacity-95" : "opacity-100"
            )}
            onError={() => setOk(false)}
          />
        ) : (
          <div className="absolute inset-0 p-8 flex flex-col items-center justify-center text-center">
            <div className={cx("text-[12px] font-mono", tone === "dark" ? "text-gray-300" : "text-gray-700")}>
              {label}
            </div>
            <div className="mt-2 text-[11px] font-mono text-gray-500">{src}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Monochrome Shopify mark */
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
  const { locale } = useLocale() || {};
  const lang = String(locale || "en").toLowerCase().startsWith("tr") ? "tr" : "en";

  const lt = useMemo(() => {
    const dict = L[lang] || L.en;
    return (key) => dict[key] ?? key;
  }, [lang]);

  const example = {
    clicks: 1284,
    sales: 38,
    netPaid: 4929.0,
    confirmed: 5661.55,
    minPayout: 250,
    platformFee: 12,
    progressPct: 64,
  };

  return (
    <PublicLayout>
      <style jsx global>{`
        .cabo-reveal-in {
          animation: caboRevealIn 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes caboRevealIn {
          from {
            opacity: 0.9;
            transform: translate3d(0, 10px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:bg-[#1a1a1a] focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:z-50"
      >
        {lt("a11y_skip")}
      </a>

      <main id="main" role="main" className="w-full scroll-smooth">
        {/* 1) HERO (dark) */}
        <SectionShell tone="dark" id="top">
          <Reveal immediate className="grid items-center gap-12 lg:gap-16 md:grid-cols-[1.15fr_.85fr]">
            <div className="text-center md:text-left">
              <Kicker tone="dark" icon={<Sparkles className="w-4 h-4 text-[#81d742]" />}>
                {lt("hero_kicker")}
              </Kicker>

              <h1 className="mt-4 text-[34px] sm:text-[46px] md:text-[58px] leading-[1.05] font-extrabold tracking-tight">
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

            {/* Right: preview */}
            <div className="relative md:pl-6 lg:pl-10">
              <div className="absolute -inset-6 blur-3xl opacity-30 bg-gradient-to-br from-[#81d742] via-[#ff8a6b] to-[#6be0ff]" />
              <SoftCard tone="dark" className="relative p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-mono text-gray-400">Cabo</div>
                  <div className="text-[11px] font-mono text-gray-500">{lt("ui_preview")}</div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { icon: <MousePointerClick className="w-4 h-4" />, label: lt("ui_clicks"), value: String(example.clicks) },
                    { icon: <ShoppingCart className="w-4 h-4" />, label: lt("ui_sales"), value: String(example.sales) },
                    { icon: <ChartNoAxesCombined className="w-4 h-4" />, label: lt("ui_net_paid"), value: `₺${example.netPaid.toFixed(2)}` },
                  ].map((x, i) => (
                    <div key={i} className="rounded-xl border border-[#222] bg-[#121212] px-3 py-3">
                      <div className="text-gray-300">{x.icon}</div>
                      <div className="mt-2 text-[13px] font-extrabold font-mono text-white leading-none">{x.value}</div>
                      <div className="mt-1 text-[11px] font-mono text-gray-500">{x.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-[#222] bg-[#101010] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-mono text-[#d1ffd0]">{lt("ui_wallet")}</div>
                    <div className="text-[11px] font-mono text-gray-500">{lt("ui_confirmed")}</div>
                  </div>

                  <div className="mt-2 text-[24px] font-extrabold font-mono text-[#d1ffd0]">
                    ₺{example.confirmed.toFixed(2)}
                  </div>

                  <div className="mt-1 text-[11px] font-mono text-gray-500">
                    {lt("ui_min_payout")} • {lt("ui_platform_fee")}{" "}
                    <span className="text-[#81d742] font-semibold">₺{example.minPayout}</span>{" "}
                    <span className="text-[#e3d67d] font-semibold">%{example.platformFee}</span>
                  </div>

                  <div className="mt-3 h-2 rounded-full bg-[#1b1b1b] overflow-hidden">
                    <div className="h-full bg-[#81d742]" style={{ width: `${example.progressPct}%` }} />
                  </div>
                </div>

                <div className="mt-4 text-[11px] font-mono text-gray-500">{lt("hero_note")}</div>
              </SoftCard>
            </div>
          </Reveal>
        </SectionShell>

        {/* 2) HOW (light) */}
        <SectionShell tone="light" id="how" withTopBorder>
          <Reveal>
            <div className="text-center">
              <Kicker tone="light" icon={<Link2 className="w-4 h-4 text-[#111]" />}>
                {lt("how_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[42px] font-extrabold tracking-tight">
                <span>{lt("how_titleA")} </span>
                <GradientWord>{lt("how_titleB")}</GradientWord>
              </h2>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {[
                { icon: <Link2 className="w-5 h-5" />, title: lt("step1_title"), desc: lt("step1_desc") },
                { icon: <Copy className="w-5 h-5" />, title: lt("step2_title"), desc: lt("step2_desc") },
                { icon: <TrendingUp className="w-5 h-5" />, title: lt("step3_title"), desc: lt("step3_desc") },
                { icon: <Wallet2 className="w-5 h-5" />, title: lt("step4_title"), desc: lt("step4_desc") },
              ].map((s, i) => (
                <SoftCard key={i} tone="light" className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-[#0b0b0b] text-white p-3">{s.icon}</div>
                    <div>
                      <div className="text-[14px] font-extrabold">{s.title}</div>
                      <div className="mt-1 text-[13px] text-[#444] leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                </SoftCard>
              ))}
            </div>

            <div className="mt-12 flex justify-center">
              <div className="inline-flex items-center gap-2 text-[11px] font-mono text-[#555]">
                <ArrowDown className="w-4 h-4" />
                <span>{lt("scroll_hint")}</span>
              </div>
            </div>
          </Reveal>
        </SectionShell>

        {/* 3) DASHBOARD (dark) */}
        <SectionShell tone="dark" id="dashboard" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-5">
              <Kicker tone="dark" icon={<ChartNoAxesCombined className="w-4 h-4 text-[#81d742]" />}>
                {lt("dash_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span className="text-white">{lt("dash_titleA")}</span>{" "}
                <GradientWord>{lt("dash_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-gray-400 max-w-xl">{lt("dash_desc")}</p>

              <div className="mt-7 grid grid-cols-3 gap-3">
                {[
                  { label: lt("ui_clicks"), value: example.clicks, icon: <MousePointerClick className="w-4 h-4" /> },
                  { label: lt("ui_sales"), value: example.sales, icon: <ShoppingCart className="w-4 h-4" /> },
                  { label: lt("ui_wallet"), value: `₺${example.confirmed.toFixed(2)}`, icon: <Wallet2 className="w-4 h-4" /> },
                ].map((x, i) => (
                  <div key={i} className="rounded-2xl border border-[#202020] bg-[#101010] p-4">
                    <div className="text-gray-400">{x.icon}</div>
                    <div className="mt-2 text-white font-mono font-extrabold text-[14px] leading-none">{x.value}</div>
                    <div className="mt-1 text-gray-500 font-mono text-[11px]">{x.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-7 md:pl-6 lg:pl-10">
              <div className="mx-auto w-full max-w-[560px] lg:max-w-[620px]">
                <ImageSlotSquare
                  tone="dark"
                  src="/screenshots/home/dashboard.png"
                  alt="Cabo dashboard screenshot"
                  label={lt("dash_img_label")}
                />
              </div>
            </div>
          </Reveal>
        </SectionShell>

        {/* 4) PRODUCTS (light) */}
        <SectionShell tone="light" id="products" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-7 md:order-1 order-2 md:pr-6 lg:pr-10">
              <div className="mx-auto w-full max-w-[560px] lg:max-w-[620px]">
                <ImageSlotSquare
                  tone="light"
                  src="/screenshots/home/products.png"
                  alt="Cabo products screenshot"
                  label={lt("products_img_label")}
                />
              </div>
            </div>

            <div className="md:col-span-5 md:order-2 order-1">
              <Kicker tone="light" icon={<Link2 className="w-4 h-4 text-[#111]" />}>
                {lt("products_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("products_titleA")} </span>
                <GradientWord>{lt("products_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-xl">{lt("products_desc")}</p>

              <div className="mt-7 flex flex-wrap gap-2">
                <Pill tone="light">{lt("pill_select_product")}</Pill>
                <Pill tone="light">{lt("pill_generate_link")}</Pill>
                <Pill tone="light">{lt("pill_copy_share")}</Pill>
              </div>
            </div>
          </Reveal>
        </SectionShell>

        {/* 5) PERFORMANCE (dark) */}
        <SectionShell tone="dark" id="performance" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-5">
              <Kicker tone="dark" icon={<TrendingUp className="w-4 h-4 text-[#81d742]" />}>
                {lt("perf_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span className="text-white">{lt("perf_titleA")}</span>{" "}
                <GradientWord>{lt("perf_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-gray-400 max-w-xl">{lt("perf_desc")}</p>

              <div className="mt-7 flex flex-wrap gap-2">
                <Pill tone="dark">{lt("pill_clicks_sales")}</Pill>
                <Pill tone="dark">{lt("pill_product_filters")}</Pill>
                <Pill tone="dark">{lt("pill_instant_insights")}</Pill>
              </div>
            </div>

            <div className="md:col-span-7 md:pl-6 lg:pl-10">
              <div className="mx-auto w-full max-w-[560px] lg:max-w-[620px]">
                <ImageSlotSquare
                  tone="dark"
                  src="/screenshots/home/performance.png"
                  alt="Cabo performance screenshot"
                  label={lt("perf_img_label")}
                />
              </div>
            </div>
          </Reveal>
        </SectionShell>

        {/* 6) WALLET (light) */}
        <SectionShell tone="light" id="wallet" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-7 md:order-1 order-2 md:pr-6 lg:pr-10">
              <div className="mx-auto w-full max-w-[560px] lg:max-w-[620px]">
                <ImageSlotSquare
                  tone="light"
                  src="/screenshots/home/wallet.png"
                  alt="Cabo wallet screenshot"
                  label={lt("wallet_img_label")}
                />
              </div>
            </div>

            <div className="md:col-span-5 md:order-2 order-1">
              <Kicker tone="light" icon={<Wallet2 className="w-4 h-4 text-[#111]" />}>
                {lt("wallet_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("wallet_titleA")} </span>
                <GradientWord>{lt("wallet_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-xl">{lt("wallet_desc")}</p>

              <SoftCard tone="light" className="mt-7 p-6">
                <div className="text-[11px] font-mono text-gray-500">{lt("ui_confirmed_available")}</div>
                <div className="mt-1 text-[26px] font-extrabold font-mono text-[#0b0b0b]">
                  ₺{example.confirmed.toFixed(2)}
                </div>
                <div className="mt-2 text-[11px] font-mono text-gray-500">
                  {lt("ui_min_payout")} <span className="font-semibold text-[#111]">₺{example.minPayout}</span> •{" "}
                  {lt("ui_platform_fee")} <span className="font-semibold text-[#111]">%{example.platformFee}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[#ececec] overflow-hidden">
                  <div className="h-full bg-[#81d742]" style={{ width: `${example.progressPct}%` }} />
                </div>
              </SoftCard>
            </div>
          </Reveal>
        </SectionShell>

        {/* 7) TRUST (dark) — to keep strict alternation */}
        <SectionShell tone="dark" id="trust" withTopBorder>
          <Reveal>
            <div className="text-center">
              <Kicker tone="dark" icon={<ShieldCheck className="w-4 h-4 text-[#81d742]" />}>
                {lt("trust_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span className="text-white">{lt("trust_titleA")} </span>
                <GradientWord>{lt("trust_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-gray-400 max-w-2xl mx-auto">
                {lt("trust_desc")}
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-2">
                <Pill tone="dark">{lt("pill1")}</Pill>
                <Pill tone="dark">{lt("pill2")}</Pill>
                <Pill tone="dark">{lt("pill3")}</Pill>
                <Pill tone="dark">{lt("pill4")}</Pill>
                <Pill tone="dark">{lt("pill5")}</Pill>
              </div>
            </div>

            <div className="mt-12 grid md:grid-cols-3 gap-5">
              {[
                { tag: lt("trust_c1_tag"), title: lt("trust_c1_title"), desc: lt("trust_c1_desc") },
                { tag: lt("trust_c2_tag"), title: lt("trust_c2_title"), desc: lt("trust_c2_desc") },
                { tag: lt("trust_c3_tag"), title: lt("trust_c3_title"), desc: lt("trust_c3_desc") },
              ].map((c, i) => (
                <SoftCard key={i} tone="dark" className="p-6">
                  <div className="text-[12px] font-mono text-gray-400">{c.tag}</div>
                  <div className="mt-2 text-[14px] font-extrabold text-white leading-snug">{c.title}</div>
                  <div className="mt-2 text-[13px] text-gray-400 leading-relaxed">{c.desc}</div>
                </SoftCard>
              ))}
            </div>
          </Reveal>
        </SectionShell>

        {/* 8) SHOPIFY (light) — strict alternation */}
        <SectionShell tone="light" id="shopify" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-7">
              <Kicker tone="light" icon={<ShopifyMark className="w-4 h-4 text-[#111]" />}>
                {lt("shopify_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("shopify_titleA")} </span>
                <GradientWord>{lt("shopify_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-2xl">{lt("shopify_desc")}</p>

              <div className="mt-7 flex flex-wrap gap-2">
                <Pill tone="light">{lt("pill_store_connection")}</Pill>
                <Pill tone="light">{lt("pill_signed_events")}</Pill>
                <Pill tone="light">{lt("pill_fast_onboarding")}</Pill>
              </div>
            </div>

            <div className="md:col-span-5 md:pl-6 lg:pl-10">
              <SoftCard tone="light" className="p-6">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-mono text-[#111] inline-flex items-center gap-2">
                    <ShopifyMark className="w-4 h-4 text-[#111]" />
                    {lt("shopify_card_title")}
                  </div>
                  <div className="text-[11px] font-mono text-gray-500">{lt("shopify_status")}</div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#e7e7e7] bg-[#fafafa] p-4">
                  <div className="text-[11px] font-mono text-gray-500">{lt("shopify_unlock_title")}</div>
                  <div className="mt-3 space-y-2">
                    {[lt("shopify_unlock_1"), lt("shopify_unlock_2"), lt("shopify_unlock_3")].map((x, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[11px] font-mono border border-[#e7e7e7] bg-white rounded-xl px-3 py-2"
                      >
                        <BadgeCheck className="w-4 h-4 text-[#1a7f37]" />
                        <span className="text-[#222]">{x}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 text-[11px] font-mono text-gray-500">{lt("shopify_note")}</div>
              </SoftCard>
            </div>
          </Reveal>
        </SectionShell>

        {/* 9) FINAL (dark) */}
        <SectionShell tone="dark" id="final" withTopBorder>
          <Reveal className="text-center">
            <h2 className="text-[28px] sm:text-[48px] font-extrabold tracking-tight">
              <span className="text-white">{lt("final_titleA")} </span>
              <GradientWord>{lt("final_titleB")}</GradientWord>
            </h2>

            <p className="mt-4 text-gray-400 max-w-2xl mx-auto text-[14px] sm:text-[16px]">
              {lt("final_desc")}
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
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
          </Reveal>
        </SectionShell>
      </main>
    </PublicLayout>
  );
}
