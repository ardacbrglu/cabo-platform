"use client";

/**
 * Homepage — FULL (PROD) ✅ Apple-like scroll + reveal + subtle parallax
 *
 * Key updates:
 * - Section order: Hero → How → MyLinks → Performance → Dashboard → Wallet → Trust → Shopify → Final
 * - Dark sections: matte black background, NO full-screen green glow
 * - Glow is LOCAL to hero preview card only (small radius, premium)
 * - Light sections: screenshot frame stays dark to blend with dark UI screenshots
 * - Screenshot slot: slightly wider than square (aspect-[6/5]) to fit your images better
 * - Copy updated (non-cringe): focus on "anyone can start, copy/paste, easy payouts"
 *
 * Security Docblock (Cabo PROD):
 * - Public page: no auth required.
 * - No secrets rendered; no user-specific data fetched client-side.
 * - No dangerouslySetInnerHTML.
 * - All assets are static from /public.
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
  LayoutGrid,
} from "lucide-react";

/* ---------- Inline dictionary (page-specific) ---------- */
const L = {
  en: {
    a11y_skip: "Skip to main content",

    hero_kicker: "Affiliate platform",
    heroTitleA: "Drop your link.",
    heroTitleB: " Let it pay you back.",
    heroDesc:
      "Create an account in minutes, claim a link, copy & share it anywhere — and watch clicks and confirmed sales update in real time. No “influencer” requirement — anyone can start.",
    cta_affiliate: "Start earning",
    cta_register: "Create account",
    cta_merchant: "Merchant access",
    scroll_hint: "Scroll to explore",
    hero_note:
      "Minimal, premium, and frictionless — because earning should feel simple.",

    how_kicker: "How it works",
    how_titleA: "Register fast.",
    how_titleB: " Copy. Share. Earn.",
    step1_title: "Create your account",
    step1_desc: "Sign up in minutes and access the marketplace instantly.",
    step2_title: "Claim your link",
    step2_desc: "Pick a product once — Cabo generates your unique tokenized link.",
    step3_title: "Copy & share",
    step3_desc: "Post it anywhere. Your link stays yours while it’s active.",
    step4_title: "Get paid",
    step4_desc: "Confirmed sales unlock wallet balance and payouts — transparent and clean.",

    mylinks_kicker: "My Links",
    mylinks_titleA: "Your links,",
    mylinks_titleB: " ready to share.",
    mylinks_desc:
      "All claimed links in one place: copy in one click, see clicks & purchases, and keep your promotion simple. The workflow is built for repeat sharing.",
    mylinks_img_label: "Drop screenshot: /public/screenshots/home/mylinks.png",
    pill_one_click_copy: "One-click copy",
    pill_live_stats: "Live stats",
    pill_repeatable: "Repeatable sharing",

    perf_kicker: "Performance",
    perf_titleA: "Track your sales",
    perf_titleB: " live.",
    perf_desc:
      "See what’s working with clarity: clicks vs confirmed sales, product-level breakdown, and trends — without noise.",
    perf_img_label: "Drop screenshot: /public/screenshots/home/performance.png",
    pill_clicks_sales: "Clicks vs Sales",
    pill_product_filters: "Product filters",
    pill_instant_insights: "Instant insights",

    dash_kicker: "Dashboard",
    dash_titleA: "See earnings early,",
    dash_titleB: " stay motivated.",
    dash_desc:
      "A compact overview that keeps momentum visible: clicks, confirmed sales, net paid, and wallet preview — all at a glance.",
    dash_img_label: "Drop screenshot: /public/screenshots/home/dashboard.png",

    wallet_kicker: "Wallet",
    wallet_titleA: "Withdraw with",
    wallet_titleB: " confidence.",
    wallet_desc:
      "Clear payout readiness, minimum threshold, and fee transparency — designed to feel effortless.",
    wallet_img_label: "Drop screenshot: /public/screenshots/home/wallet.png",

    trust_kicker: "Built for trust",
    trust_titleA: "Stable tracking.",
    trust_titleB: " Safer payouts.",
    trust_desc:
      "Production-minded patterns to protect users, tracking, and payouts — while keeping the product fast and simple.",
    pill1: "Role & status gates",
    pill2: "Rate limiting",
    pill3: "Audit-friendly logs",
    pill4: "Verified callbacks (HMAC)",
    pill5: "Strict headers",

    trust_c1_tag: "RBAC",
    trust_c1_title: "Access control for protected actions.",
    trust_c1_desc:
      "Sensitive routes require an authenticated session, correct role, and active status — no accidental exposure.",
    trust_c2_tag: "Protection",
    trust_c2_title: "Request IDs, rate limits, safe defaults.",
    trust_c2_desc:
      "Requests can be traced via request IDs; abuse is reduced with IP/user limits and conservative caching.",
    trust_c3_tag: "Integrity",
    trust_c3_title: "Reliable event tracking.",
    trust_c3_desc:
      "Purchase events can be verified via signed callbacks (HMAC-style) and logged for accountability.",

    shopify_kicker: "Shopify",
    shopify_titleA: "Shopify integration",
    shopify_titleB: " is coming.",
    shopify_desc:
      "We’re building a Shopify app so merchants can connect stores faster and send verified purchase events back to Cabo.",
    shopify_note:
      "When available, events will be accepted only if signed/verified — commissions are credited only for valid transactions.",
    shopify_card_title: "Shopify app",
    shopify_status: "On the way",
    shopify_unlock_title: "What it unlocks",
    shopify_unlock_1: "Fast store connection",
    shopify_unlock_2: "Verified purchase callbacks",
    shopify_unlock_3: "Cleaner merchant onboarding",

    final_titleA: "Ready to",
    final_titleB: " earn smarter?",
    final_desc:
      "Create an account in minutes and start sharing. Or access the merchant portal to list products and track performance.",
    final_cta_primary: "Create / Login",
    final_cta_merchant: "Merchant Portal",

    ui_preview: "Preview",
    ui_clicks: "Clicks",
    ui_sales: "Sales",
    ui_net_paid: "Net Paid",
    ui_wallet: "Wallet",
    ui_confirmed: "Confirmed",
    ui_min_payout: "Min payout",
    ui_platform_fee: "Platform fee",
    ui_confirmed_available: "Confirmed available",
  },

  tr: {
    a11y_skip: "Ana içeriğe geç",

    hero_kicker: "Affiliate platformu",
    heroTitleA: "Linkini bırak.",
    heroTitleB: " Para sana aksın.",
    heroDesc:
      "Dakikalar içinde kayıt ol, linkini al, kopyala & paylaş — tıklamalar ve onaylı satışlar canlı güncellensin. “Influencer olma” şartı yok — herkes başlayabilir.",
    cta_affiliate: "Kazanmaya başla",
    cta_register: "Hesap oluştur",
    cta_merchant: "Satıcı girişi",
    scroll_hint: "Keşfetmek için kaydır",
    hero_note:
      "Minimal, premium ve zahmetsiz — çünkü kazanmak basit hissettirmeli.",

    how_kicker: "Nasıl çalışır?",
    how_titleA: "Hızlı kayıt.",
    how_titleB: " Kopyala. Paylaş. Kazan.",
    step1_title: "Hesabını oluştur",
    step1_desc: "Dakikalar içinde kayıt ol ve marketplace’e hemen gir.",
    step2_title: "Linkini al",
    step2_desc: "Bir ürünü bir kez seç — Cabo sana özel token’lı link üretir.",
    step3_title: "Kopyala & paylaş",
    step3_desc: "Her yerde paylaş. Linkin aktifken seninle kalır.",
    step4_title: "Ödeme al",
    step4_desc: "Onaylı satışlar wallet’ta birikir, çekimler net ve şeffaftır.",

    mylinks_kicker: "My Links",
    mylinks_titleA: "Linklerin burada,",
    mylinks_titleB: " paylaşmaya hazır.",
    mylinks_desc:
      "Tüm linklerini tek yerde yönet: tek tıkla kopyala, tıklama & satın alma sayılarını gör, paylaşımı basit tut. Sistem tekrar tekrar paylaşmak için tasarlandı.",
    mylinks_img_label: "Ekran görüntüsü: /public/screenshots/home/mylinks.png",
    pill_one_click_copy: "Tek tık kopyala",
    pill_live_stats: "Canlı istatistik",
    pill_repeatable: "Tekrarlanabilir paylaşım",

    perf_kicker: "Performans",
    perf_titleA: "Satışlarını",
    perf_titleB: " canlı izle.",
    perf_desc:
      "Ne işe yarıyor net gör: tıklama vs onaylı satış, ürün bazlı kırılım ve trendler — gürültüsüz.",
    perf_img_label: "Ekran görüntüsü: /public/screenshots/home/performance.png",
    pill_clicks_sales: "Tıklama vs Satış",
    pill_product_filters: "Ürün filtreleri",
    pill_instant_insights: "Anında içgörü",

    dash_kicker: "Dashboard",
    dash_titleA: "Kazancı erken gör,",
    dash_titleB: " motive kal.",
    dash_desc:
      "Kompakt özet: tıklama, onaylı satış, net ödenen ve wallet önizlemesi — tek bakışta.",
    dash_img_label: "Ekran görüntüsü: /public/screenshots/home/dashboard.png",

    wallet_kicker: "Wallet",
    wallet_titleA: "Güvenle",
    wallet_titleB: " çekim yap.",
    wallet_desc:
      "Minimum eşik, platform ücreti ve ödeme uygunluğu net — zahmetsiz hissetsin diye.",
    wallet_img_label: "Ekran görüntüsü: /public/screenshots/home/wallet.png",

    trust_kicker: "Güven için üretildi",
    trust_titleA: "Stabil takip.",
    trust_titleB: " Daha güvenli çekim.",
    trust_desc:
      "Kullanıcıyı, takibi ve ödemeleri koruyan production desenleri — hızlı ve basit kalacak şekilde.",
    pill1: "Rol & status kapıları",
    pill2: "Rate limiting",
    pill3: "Audit log uyumlu",
    pill4: "Doğrulanmış callback (HMAC)",
    pill5: "Sıkı header’lar",

    trust_c1_tag: "RBAC",
    trust_c1_title: "Kritik işlemlerde erişim kontrolü.",
    trust_c1_desc:
      "Korunan aksiyonlar oturum + doğru rol + active status ister — yanlış erişim azalır.",
    trust_c2_tag: "Koruma",
    trust_c2_title: "Request ID, rate limit, güvenli varsayılanlar.",
    trust_c2_desc:
      "Her istek request-id ile izlenir; user+IP limitleri ve cache kontrolüyle abuse düşer.",
    trust_c3_tag: "Bütünlük",
    trust_c3_title: "Güvenilir event takibi.",
    trust_c3_desc:
      "Satın alma event’leri imzalı callback (HMAC) ile doğrulanabilir; audit log’larla kayıt altına alınır.",

    shopify_kicker: "Shopify",
    shopify_titleA: "Shopify entegrasyonu",
    shopify_titleB: " yakında.",
    shopify_desc:
      "Mağazaları daha hızlı bağlamak ve Cabo’ya doğrulanmış satın alma event’leri göndermek için Shopify uygulaması geliştiriyoruz.",
    shopify_note:
      "Yayına alındığında event’ler yalnızca imzalı/doğrulanmış şekilde kabul edilir — komisyon sadece geçerli işlemlerde yazılır.",
    shopify_card_title: "Shopify uygulaması",
    shopify_status: "Yakında",
    shopify_unlock_title: "Ne sağlar?",
    shopify_unlock_1: "Hızlı mağaza bağlantısı",
    shopify_unlock_2: "Doğrulanmış satın alma callback’leri",
    shopify_unlock_3: "Daha temiz merchant onboarding",

    final_titleA: "Hazır mısın?",
    final_titleB: " Daha akıllı kazan.",
    final_desc:
      "Dakikalar içinde hesap aç ve paylaşmaya başla. Ya da satıcı portalına girip ürünlerini listele ve performansı takip et.",
    final_cta_primary: "Kayıt / Giriş",
    final_cta_merchant: "Satıcı Portalı",

    ui_preview: "Önizleme",
    ui_clicks: "Tıklama",
    ui_sales: "Satış",
    ui_net_paid: "Net Ödenen",
    ui_wallet: "Wallet",
    ui_confirmed: "Onaylı",
    ui_min_payout: "Min. çekim",
    ui_platform_fee: "Platform ücreti",
    ui_confirmed_available: "Çekilebilir onaylı",
  },
};

/* ---------- helpers ---------- */
const cx = (...a) => a.filter(Boolean).join(" ");

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

/**
 * Reveal once on enter
 */
function useRevealOnce({
  threshold = 0.14,
  rootMargin = "0px 0px -14% 0px",
  immediate = false,
} = {}) {
  const ref = useRef(null);
  const [reveal, setReveal] = useState(immediate);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (immediate) {
      setReveal(true);
      return;
    }
    if (prefersReducedMotion()) {
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

/**
 * Subtle parallax for a visual block (only while near viewport)
 * - sets CSS var --caboPar on the element
 */
function useParallaxVar(ref, { strength = 12 } = {}) {
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    let raf = 0;
    let active = false;

    const update = () => {
      raf = 0;
      if (!active) return;

      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;

      const center = rect.top + rect.height / 2;
      const t = (center - vh / 2) / (vh / 2);
      const clamped = Math.max(-1, Math.min(1, t));

      const px = -clamped * strength;
      el.style.setProperty("--caboPar", `${px.toFixed(2)}px`);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    const io = new IntersectionObserver(
      (entries) => {
        active = entries.some((e) => e.isIntersecting);
        if (active) {
          update();
          window.addEventListener("scroll", onScroll, { passive: true });
          window.addEventListener("resize", onScroll, { passive: true });
        } else {
          window.removeEventListener("scroll", onScroll);
          window.removeEventListener("resize", onScroll);
          el.style.setProperty("--caboPar", "0px");
        }
      },
      { threshold: 0.01, rootMargin: "20% 0px 20% 0px" }
    );

    io.observe(el);

    return () => {
      try {
        io.disconnect();
      } catch {}
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, strength]);
}

function Reveal({ children, className = "", immediate = false, delay = 0 }) {
  const r = useRevealOnce({ immediate });
  const style = delay ? { animationDelay: `${delay}ms` } : undefined;

  return (
    <div
      ref={r.ref}
      style={style}
      className={cx(
        "will-change-[opacity,transform,filter] transition-none",
        immediate ? "cabo-reveal-in" : r.reveal ? "cabo-reveal-in" : "cabo-reveal-pending",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Full-bleed section shell
 * - Dark sections: matte black, NO big glow overlay
 * - Light sections: clean white with subtle neutral radial (not green)
 */
function SectionShell({ tone = "dark", id, withTopBorder = false, children }) {
  const isDark = tone === "dark";
  return (
    <section
      id={id}
      className={cx(
        "relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen",
        "min-h-screen flex items-center justify-center",
        "scroll-snap-align-start",
        isDark ? "bg-[#060606] text-white" : "bg-white text-[#0b0b0b]",
        withTopBorder ? (isDark ? "border-t border-[#111]" : "border-t border-[#e7e7e7]") : ""
      )}
    >
      {/* Subtle neutral vignette only (NO green wash) */}
      <div
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute inset-0",
          isDark
            ? "opacity-[0.01] bg-[radial-gradient(900px_480px_at_50%_0%,rgba(255,255,255,0.06),transparent_60%)]"
            : "opacity-100 bg-[radial-gradient(900px_520px_at_50%_10%,rgba(0,0,0,0.06),transparent_60%)]"
        )}
      />
      <div className="relative w-full max-w-7xl px-4 sm:px-6 lg:px-10 py-14 sm:py-20">
        {children}
      </div>
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
        ? "bg-[#0f0f0f] border border-[#1b1b1b] text-[#cfcfcf]"
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
        ? "bg-[#101010] border-[#1f1f1f] shadow-[0_18px_60px_rgba(0,0,0,.55)]"
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
        ? "bg-[#0f0f0f] border border-[#242424] text-[#d8d8d8]"
        : "bg-[#f8f8f8] border border-[#e6e6e6] text-[#222]"
    )}
  >
    {children}
  </span>
);

/**
 * Slightly-wider screenshot slot:
 * - aspect-[6/5] (wider than square)
 * - Frame can be forced "dark" to blend with dark UI screenshots (even on light sections)
 */
function ImageSlotWide({
  tone = "dark",
  frame = "auto", // "auto" | "dark"
  src,
  alt,
  label,
}) {
  const [ok, setOk] = useState(true);
  const wrapRef = useRef(null);

  useParallaxVar(wrapRef, { strength: 12 });

  const frameDark = frame === "dark" || tone === "dark";

  return (
    <div
      ref={wrapRef}
      className={cx(
        "rounded-3xl border overflow-hidden",
        frameDark ? "border-[#1f1f1f] bg-[#0b0b0b]" : "border-[#efefef] bg-white",
        "shadow-[0_22px_70px_rgba(0,0,0,0.24)]",
        "transform-gpu"
      )}
      style={{
        transform: "translate3d(0,var(--caboPar,0px),0)",
        transition: "transform 140ms linear",
      }}
    >
      <div className="relative aspect-[6/5] w-full">
        {ok ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className={cx(
              "absolute inset-0 w-full h-full object-cover block",
              frameDark ? "opacity-95" : "opacity-100"
            )}
            onError={() => setOk(false)}
          />
        ) : (
          <div className="absolute inset-0 p-8 flex flex-col items-center justify-center text-center">
            <div className={cx("text-[12px] font-mono", frameDark ? "text-gray-300" : "text-gray-700")}>
              {label}
            </div>
            <div className="mt-2 text-[11px] font-mono text-gray-500">{src}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Shopify svg from /public/shopify.svg */
function ShopifySvg({ className = "w-4 h-4" }) {
  return (
    <img
      src="/shopify.svg"
      alt="Shopify"
      className={cx(className, "inline-block")}
      loading="lazy"
      draggable={false}
    />
  );
}

/* ---------- page ---------- */
export default function Homepage() {
  const { locale } = useLocale?.() || {};
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
        /* Apple-like pacing */
        #cabo-main {
          scroll-snap-type: y proximity;
          scroll-behavior: smooth;
        }
        .scroll-snap-align-start {
          scroll-snap-align: start;
        }

        /* Reveal animations */
        .cabo-reveal-pending {
          opacity: 0;
          transform: translate3d(0, 18px, 0);
          filter: blur(6px);
        }
        .cabo-reveal-in {
          animation: caboRevealIn 780ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes caboRevealIn {
          from {
            opacity: 0;
            transform: translate3d(0, 18px, 0);
            filter: blur(8px);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0px);
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          #cabo-main {
            scroll-behavior: auto;
          }
          .cabo-reveal-pending {
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
          .cabo-reveal-in {
            animation: none !important;
          }
        }
      `}</style>

      {/* Skip link */}
      <a
        href="#cabo-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:bg-[#111] focus:text-white focus:px-3 focus:py-2 focus:rounded-md focus:z-50"
      >
        {lt("a11y_skip")}
      </a>

      <div className="w-full">
        {/* 1) HERO (dark) */}
        <SectionShell tone="dark" id="top">
          <Reveal immediate className="grid items-center gap-12 lg:gap-16 md:grid-cols-[1.15fr_.85fr]">
            <div className="text-center md:text-left">
              <Kicker tone="dark" icon={<Sparkles className="w-4 h-4 text-[#81d742]" />}>
                {lt("hero_kicker")}
              </Kicker>

              <h1 className="mt-4 text-[34px] sm:text-[46px] md:text-[58px] leading-[1.05] font-extrabold tracking-tight">
                <span className="text-[#eaeaea]">{lt("heroTitleA")}</span>
                <span> </span>
                <GradientWord className="font-extrabold">{lt("heroTitleB")}</GradientWord>
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
                    focus:ring-offset-2 focus:ring-offset-[#060606]
                  "
                  style={{ boxShadow: "0 10px 40px rgba(129,215,66,.10)" }}
                >
                  {lt("cta_affiliate")}
                </Link>

                <Link
                  href="/register"
                  prefetch={false}
                  className="
                    bg-transparent text-[#eaeaea]
                    border border-[#262626] hover:border-[#3a3a3a] hover:bg-[#0f0f0f]
                    font-semibold text-[15px] px-6 py-3 rounded-xl
                    transition duration-200 active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-[#2f4]
                    focus:ring-offset-2 focus:ring-offset-[#060606]
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

            {/* Right: preview with LOCAL glow only */}
            <div className="relative md:pl-6 lg:pl-10">
              {/* Local glow (small radius, doesn't wash the whole section) */}
              <div
                className="pointer-events-none absolute -inset-6 md:-inset-8 blur-3xl"
                style={{
                  opacity: 0.22,
                  background:
                    "radial-gradient(420px 260px at 55% 45%, rgba(129,215,66,.55), transparent 65%), radial-gradient(380px 220px at 65% 55%, rgba(255,138,107,.45), transparent 70%), radial-gradient(360px 220px at 45% 60%, rgba(107,224,255,.35), transparent 72%)",
                }}
              />

              <SoftCard tone="dark" className="relative p-5">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-mono text-gray-400">Cabo</div>
                  <div className="text-[11px] font-mono text-gray-500">{lt("ui_preview")}</div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    {
                      icon: <MousePointerClick className="w-4 h-4" />,
                      label: lt("ui_clicks"),
                      value: String(example.clicks),
                    },
                    {
                      icon: <ShoppingCart className="w-4 h-4" />,
                      label: lt("ui_sales"),
                      value: String(example.sales),
                    },
                    {
                      icon: <ChartNoAxesCombined className="w-4 h-4" />,
                      label: lt("ui_net_paid"),
                      value: `₺${example.netPaid.toFixed(2)}`,
                    },
                  ].map((x, i) => (
                    <div key={i} className="rounded-xl border border-[#1f1f1f] bg-[#0c0c0c] px-3 py-3">
                      <div className="text-gray-300">{x.icon}</div>
                      <div className="mt-2 text-[13px] font-extrabold font-mono text-white leading-none">
                        {x.value}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-gray-500">{x.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-[#1f1f1f] bg-[#0b0b0b] p-4">
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

                  <div className="mt-3 h-2 rounded-full bg-[#161616] overflow-hidden">
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
                { icon: <LayoutGrid className="w-5 h-5" />, title: lt("step1_title"), desc: lt("step1_desc") },
                { icon: <Link2 className="w-5 h-5" />, title: lt("step2_title"), desc: lt("step2_desc") },
                { icon: <Copy className="w-5 h-5" />, title: lt("step3_title"), desc: lt("step3_desc") },
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

        {/* 3) MY LINKS (dark) */}
        <SectionShell tone="dark" id="mylinks" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-5">
              <Kicker tone="dark" icon={<Link2 className="w-4 h-4 text-[#81d742]" />}>
                {lt("mylinks_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span className="text-white">{lt("mylinks_titleA")}</span>{" "}
                <GradientWord>{lt("mylinks_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-gray-400 max-w-xl">{lt("mylinks_desc")}</p>

              <div className="mt-7 flex flex-wrap gap-2">
                <Pill tone="dark">{lt("pill_one_click_copy")}</Pill>
                <Pill tone="dark">{lt("pill_live_stats")}</Pill>
                <Pill tone="dark">{lt("pill_repeatable")}</Pill>
              </div>
            </div>

            <div className="md:col-span-7 md:pl-6 lg:pl-10">
              <div className="mx-auto w-full max-w-[620px] lg:max-w-[720px]">
                <ImageSlotWide
                  tone="dark"
                  src="/screenshots/home/mylinks.png"
                  alt="Cabo My Links screenshot"
                  label={lt("mylinks_img_label")}
                />
              </div>
            </div>
          </Reveal>
        </SectionShell>

        {/* 4) PERFORMANCE (light) */}
        <SectionShell tone="light" id="performance" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-7 md:order-1 order-2 md:pr-6 lg:pr-10">
              <div className="mx-auto w-full max-w-[620px] lg:max-w-[720px]">
                {/* Force DARK frame on LIGHT section to blend screenshot edges */}
                <ImageSlotWide
                  tone="light"
                  frame="dark"
                  src="/screenshots/home/performance.png"
                  alt="Cabo performance screenshot"
                  label={lt("perf_img_label")}
                />
              </div>
            </div>

            <div className="md:col-span-5 md:order-2 order-1">
              <Kicker tone="light" icon={<TrendingUp className="w-4 h-4 text-[#111]" />}>
                {lt("perf_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("perf_titleA")} </span>
                <GradientWord>{lt("perf_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-xl">{lt("perf_desc")}</p>

              <div className="mt-7 flex flex-wrap gap-2">
                <Pill tone="light">{lt("pill_clicks_sales")}</Pill>
                <Pill tone="light">{lt("pill_product_filters")}</Pill>
                <Pill tone="light">{lt("pill_instant_insights")}</Pill>
              </div>
            </div>
          </Reveal>
        </SectionShell>

        {/* 5) DASHBOARD (dark) */}
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
                  <div key={i} className="rounded-2xl border border-[#1f1f1f] bg-[#0b0b0b] p-4">
                    <div className="text-gray-400">{x.icon}</div>
                    <div className="mt-2 text-white font-mono font-extrabold text-[14px] leading-none">{x.value}</div>
                    <div className="mt-1 text-gray-500 font-mono text-[11px]">{x.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-7 md:pl-6 lg:pl-10">
              <div className="mx-auto w-full max-w-[620px] lg:max-w-[720px]">
                <ImageSlotWide
                  tone="dark"
                  src="/screenshots/home/dashboard.png"
                  alt="Cabo dashboard screenshot"
                  label={lt("dash_img_label")}
                />
              </div>
            </div>
          </Reveal>
        </SectionShell>

        {/* 6) WALLET (light) */}
        <SectionShell tone="light" id="wallet" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-7 md:order-1 order-2 md:pr-6 lg:pr-10">
              <div className="mx-auto w-full max-w-[620px] lg:max-w-[720px]">
                {/* Force DARK frame on LIGHT section to blend screenshot edges */}
                <ImageSlotWide
                  tone="light"
                  frame="dark"
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

        {/* 7) TRUST (dark) */}
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

        {/* 8) SHOPIFY (light) */}
        <SectionShell tone="light" id="shopify" withTopBorder>
          <Reveal className="grid md:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="md:col-span-7">
              <Kicker tone="light" icon={<ShopifySvg className="w-4 h-4" />}>
                {lt("shopify_kicker")}
              </Kicker>

              <h2 className="mt-4 text-[28px] sm:text-[40px] font-extrabold tracking-tight">
                <span>{lt("shopify_titleA")} </span>
                <GradientWord>{lt("shopify_titleB")}</GradientWord>
              </h2>

              <p className="mt-4 text-[13px] sm:text-[14px] text-[#444] max-w-2xl">{lt("shopify_desc")}</p>
              <p className="mt-3 text-[11px] font-mono text-gray-500 max-w-2xl">{lt("shopify_note")}</p>
            </div>

            <div className="md:col-span-5 md:pl-6 lg:pl-10">
              <SoftCard tone="light" className="p-6">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-mono text-[#111] inline-flex items-center gap-2">
                    <ShopifySvg className="w-4 h-4" />
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
                  focus:ring-offset-2 focus:ring-offset-[#060606]
                "
                style={{ boxShadow: "0 10px 40px rgba(129,215,66,.10)" }}
              >
                {lt("final_cta_primary")}
              </Link>

              <Link
                href="/merchant/login"
                prefetch={false}
                className="
                  bg-transparent text-[#eaeaea]
                  border border-[#262626] hover:border-[#3a3a3a] hover:bg-[#0f0f0f]
                  font-semibold text-[15px] px-7 py-3 rounded-xl
                  transition duration-200 active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-[#2f4]
                  focus:ring-offset-2 focus:ring-offset-[#060606]
                "
              >
                {lt("final_cta_merchant")}
              </Link>
            </div>
          </Reveal>
        </SectionShell>
      </div>
    </PublicLayout>
  );
}
