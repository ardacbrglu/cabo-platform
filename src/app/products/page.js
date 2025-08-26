"use client";

/**
 * File: src/app/products/page.js
 * Purpose: Product Marketplace (Affiliate) — PROD
 * Security Docblock (Frontend):
 * - Tüm istekler tek apiFetch wrapper’ı ile (credentials:'include', X-Requested-With, X-Request-Id).
 * - Mutasyonlar (promote) backend’de RBAC + status:active + rate-limit + Origin/Referer kontrolü altında.
 * - Custom CSRF/JWT yok; NextAuth mekanizmaları kullanılır.
 * - UI: Koyu tema, erişilebilir kontrast; metrik kutularında metin taşması yok; tabular numerals.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import Layout from "@/components/Layout";
import {
  BadgePercent,
  MousePointerClick,
  Activity,
  Coins,
  Link2,
  Search,
  Ban,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { apiFetch } from "@/lib/apiFetch";

const PLACEHOLDER = "https://placehold.co/128x128?text=Product";

/* -------- Palette -------- */
const CARD_BG = "#181818";
const CARD_BORDER = "#232323";
const SURFACE_GREY = "#232323";
const SURFACE_GREY_BORDER = "#343a34";
const ACCENT = "#81d742";

const money = (n) => `₺${Number(n || 0).toFixed(2)}`;
const perSale = (p) =>
  Math.max(0, (Number(p.price || 0) * Number(p.commissionRate || 0)) / 100);

function handleImgError(e) {
  e.currentTarget.onerror = null;
  e.currentTarget.src = PLACEHOLDER;
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const [products, setProducts] = useState([]);
  const [userLinks, setUserLinks] = useState([]);
  const [visibleLinkIds, setVisibleLinkIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [cardLoading, setCardLoading] = useState({});
  const [cardMessages, setCardMessages] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const { setUser } = useUser();

  /* Navbar cache senkronu */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const name = localStorage.getItem("cabo_username");
    const email = localStorage.getItem("cabo_email");
    const id = localStorage.getItem("cabo_userId");
    if (name || email || id) {
      setUser((u) => ({
        ...(u || {}),
        name: u?.name || name || u?.name,
        email: u?.email || email || u?.email,
        id: u?.id || (id ? Number(id) : u?.id),
        role: u?.role || "affiliate",
      }));
    }
  }, [setUser]);

  /* Data load */
  useEffect(() => {
    let alive = true;
    const MIN = 300;
    const start = performance.now();

    (async () => {
      try {
        const res = await apiFetch("/api/products", {
          method: "GET",
          headers: {
            accept: "application/json",
            "cache-control": "no-cache",
            pragma: "no-cache",
          },
          cache: "no-store",
        });
        const j = await res.json();
        if (!alive) return;

        const p = Array.isArray(j?.products) ? j.products : [];
        const ul = Array.isArray(j?.userLinks) ? j.userLinks : [];
        const v = new Set(
          Array.isArray(j?.visibleLinkIds)
            ? j.visibleLinkIds
            : ul.filter((x) => x.isVisible).map((x) => x.productId)
        );

        setProducts(p);
        setUserLinks(ul);
        setVisibleLinkIds(v);
      } catch {
        if (!alive) return;
        setProducts([]);
        setUserLinks([]);
        setVisibleLinkIds(new Set());
        setCardMessages({ global: t("productError") });
      } finally {
        const left = Math.max(0, MIN - (performance.now() - start));
        setTimeout(() => alive && setLoading(false), left);
      }
    })();

    apiFetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.userId) return;
        setUser((u) => ({ ...(u || {}), ...data, role: "affiliate" }));
        if (typeof window !== "undefined") {
          if (data.username) localStorage.setItem("cabo_username", data.username);
          if (data.email) localStorage.setItem("cabo_email", data.email);
          if (data.userId) localStorage.setItem("cabo_userId", String(data.userId));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [setUser, t]);

  const hasVisible = (pid) => visibleLinkIds.has(pid);
  const statusOf = (p) =>
    !p.isActive
      ? "inactive"
      : p.maxSalesLimit != null && p.totalPurchases >= p.maxSalesLimit
      ? "quota"
      : "active";
  const quotaLeft = (p) =>
    p.maxSalesLimit == null
      ? Infinity
      : Math.max(0, Number(p.maxSalesLimit) - Number(p.totalPurchases || 0));

  async function promoteProduct(productId) {
    if (hasVisible(productId)) return;
    setCardLoading((s) => ({ ...s, [productId]: true }));
    setCardMessages((s) => ({ ...s, [productId]: "" }));
    try {
      const res = await apiFetch("/api/products/promote", {
        method: "POST",
        body: { productId },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCardMessages((s) => ({ ...s, [productId]: t("productSuccess") }));
        setUserLinks((prev) => {
          const ex = prev.find((l) => l.productId === productId);
          if (ex) return prev.map((l) => (l.productId === productId ? { ...l, isVisible: true } : l));
          return [...prev, { productId, token: data.token, isVisible: true, expiresAt: data.expiresAt || null }];
        });
        setVisibleLinkIds((prev) => new Set(prev).add(productId));
      } else {
        setCardMessages((s) => ({ ...s, [productId]: data?.error || t("productError") }));
      }
    } catch {
      setCardMessages((s) => ({ ...s, [productId]: t("productError") }));
    } finally {
      setCardLoading((s) => ({ ...s, [productId]: false }));
      setTimeout(() => setCardMessages((s) => ({ ...s, [productId]: "" })), 1700);
    }
  }

  const filtered = products.filter((p) => {
    if (!searchTerm.trim()) return true;
    const text = `${p.name || ""} ${p.description || ""}`.toLowerCase();
    return text.includes(searchTerm.trim().toLowerCase());
  });

  return (
    <Layout>
      {/* Header + Search */}
      <div className="flex flex-col items-center mt-10 mb-6 px-3">
        <h1 className="text-4xl md:text-6xl font-extrabold text-[#d1ffd0] tracking-tight">
          {t("productMarketplace")}
        </h1>
        <p className="mt-3 text-base md:text-lg text-gray-200 font-mono opacity-90 text-center max-w-2xl">
          {t("productSubtitle")}
        </p>

        <div className="mt-5 w-full flex justify-center">
          <div className="relative w-full max-w-[420px]">
            <input
              type="text"
              className="w-full rounded-xl px-4 py-2 pl-10 text-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-[#888]/30 placeholder:text-gray-400 transition shadow-sm"
              style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
              placeholder="Search for product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa]" />
            {!!searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white text-xs px-2 py-1 rounded hover:opacity-90"
                style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className={`w-full max-w-7xl mx-auto px-3 md:px-8 pb-14 ${loading ? "opacity-60" : "opacity-100"}`}>
        {cardMessages.global && (
          <div
            className="mb-5 text-center font-mono font-bold rounded-lg px-5 py-3 max-w-lg mx-auto text-base"
            style={{ color: ACCENT, background: "#202820", border: "1px solid #263826" }}
          >
            {cardMessages.global}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center gap-x-9 gap-y-10">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl"
                  style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, height: 430, width: "100%", maxWidth: 380 }}
                />
              ))
            : filtered.map((p) => {
                const status = statusOf(p);
                const disabled = status !== "active";
                const has = hasVisible(p.productId);
                const earn = perSale(p);
                const quota = quotaLeft(p);

                return (
                  <article
                    key={p.productId}
                    className="relative rounded-2xl shadow-lg transition-transform duration-200 ease-out will-change-transform"
                    style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, width: "100%", maxWidth: 380 }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px) scale(1.01)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}
                  >
                    {/* Top row chips: Fiyat solda (içeride), Komisyon sağda ve hafif dışarı taşan */}
                    <div className="flex items-start justify-between gap-2 px-4 pt-4 relative">
                      <Chip text={`${t("productPrice")}: ${money(p.price || 0)}`} />
                      <Chip
                        icon={<BadgePercent size={15} />}
                        text={`${Number(p.commissionRate || 0).toFixed(2)}% ${t("productCommission")}`}
                        tone="accent"
                        pop="upright"
                      />
                    </div>

                    {/* Image + title */}
                    <div className="flex gap-4 px-5 pt-6">
                      <div
                        className="w-28 h-28 rounded-xl overflow-hidden shrink-0"
                        style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
                      >
                        <img
                          src={p.imageUrl || PLACEHOLDER}
                          alt={p.name}
                          className="object-cover w-full h-full transition-transform duration-300"
                          onError={handleImgError}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
                        />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-2xl font-black text-white leading-tight mb-1">{p.name}</h2>
                        <p className="text-gray-300/90 text-[15px] line-clamp-2">{p.description || ""}</p>
                      </div>
                    </div>

                    {/* status badge */}
                    {disabled && (
                      <div className="absolute left-4 top-[70px]">
                        <span className="flex items-center gap-1 bg-red-700/90 text-white px-3 py-1 rounded-full text-xs">
                          <Ban size={13} /> {status === "inactive" ? t("productInactive") : t("productQuota")}
                        </span>
                      </div>
                    )}

                    {/* Metrics — etiket+ikon üstte (ikon sağda), değer ortada, altta caption */}
                    <div className="px-5 pt-6 grid grid-cols-2 gap-4">
                      <MetricBox
                        label={t("clicks")}
                        icon={<MousePointerClick size={16} />}
                        value={p.totalClicks || 0}
                        caption={t("totalClicks")}
                      />
                      <MetricBox
                        label={t("sales")}
                        icon={<Activity size={16} />}
                        value={p.totalPurchases || 0}
                        caption={t("totalSales")}
                      />
                      <MetricBox
                        label={t("productEarn")}
                        icon={<Coins size={16} />}
                        value={<span className="font-extrabold" style={{ color: ACCENT }}>{money(earn)}</span>}
                      />
                      <MetricBox
                        label={t("quotaLeft")}
                        value={isFinite(quota) ? quota : "∞"}
                      />
                    </div>

                    {/* Actions */}
                    <div className="px-5 pb-5 pt-4">
                      {disabled ? (
                        <button
                          type="button"
                          disabled
                          className="w-full rounded-xl font-mono font-bold py-2.5 text-gray-400 cursor-not-allowed"
                          style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
                        >
                          {status === "inactive" ? t("productInactive") : t("productQuota")}
                        </button>
                      ) : has ? (
                        <>
                          <button
                            type="button"
                            disabled
                            className="w-full rounded-xl font-mono font-bold py-2.5 text-gray-300"
                            style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
                          >
                            {t("productAdded")}
                          </button>
                          <div className="flex items-center justify-center gap-1 mt-2 text-gray-400 text-xs font-mono">
                            <Link2 size={14} />
                            {t("productManage")} <span className="underline ml-1">{t("productMyLinks")}</span>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => promoteProduct(p.productId)}
                          disabled={!!cardLoading[p.productId]}
                          className="w-full rounded-xl font-black font-mono py-2.5 text-[#0e1a0c] shadow-lg hover:shadow-xl transition"
                          style={{ background: ACCENT, border: "1px solid #6ec43c" }}
                        >
                          {cardLoading[p.productId] ? t("loading") : t("productGetLink")}
                        </button>
                      )}
                    </div>

                    {/* Card toast */}
                    {cardMessages[p.productId] && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 -top-3 px-4 py-2 rounded-lg text-sm font-mono"
                        style={{ background: "#202820", border: "1px solid #263826", color: ACCENT }}
                      >
                        {cardMessages[p.productId]}
                      </div>
                    )}
                  </article>
                );
              })}
        </div>
      </div>

      <style jsx global>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .tabnums {
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 640px) {
          .grid {
            justify-items: center;
          }
        }
      `}</style>
    </Layout>
  );
}

/* ---------- UI Bits ---------- */

function Chip({ icon, text, tone = "default", pop = "none" }) {
  const base = {
    color: tone === "accent" ? "#eaffea" : "#f3f3f3",
    background: tone === "accent" ? "rgba(129,215,66,0.12)" : SURFACE_GREY,
    border: tone === "accent" ? "1px solid #2d5b2d" : `1px solid ${SURFACE_GREY_BORDER}`,
    boxShadow:
      tone === "accent"
        ? "inset 0 1px 0 rgba(255,255,255,0.05)"
        : "inset 0 1px 0 rgba(255,255,255,0.03)",
    borderRadius: "10px",
  };

  const popStyle =
    pop === "upright"
      ? {
          position: "relative",
          transform: "translate(10px, -12px)", // sağa ve yukarı hafif taşma
          zIndex: 1,
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        }
      : pop === "up"
      ? { position: "relative", transform: "translateY(-12px)", zIndex: 1 }
      : {};

  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 text-[13px] font-semibold whitespace-nowrap"
      style={{ ...base, ...popStyle }}
    >
      <span className="opacity-90">{text}</span>
      {icon ? <span className="opacity-90">{icon}</span> : null}
    </span>
  );
}

function MetricBox({ icon, label, value, caption }) {
  return (
    <div
      className="rounded-xl px-3 py-3 flex flex-col justify-between min-h-[112px]"
      style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
      title={typeof label === "string" ? label : undefined}
    >
      {/* üst şerit: etiket + ikon (ikon sağda) */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-gray-300 text-sm font-medium">{label}</span>
        {icon ? <span className="text-gray-300 shrink-0">{icon}</span> : null}
      </div>

      {/* değer: ortalanmış */}
      <div className="text-center text-white text-xl font-bold tabnums mt-2 break-words">
        {value}
      </div>

      {/* caption: küçük, gri — boşluk doldurur */}
      {caption ? (
        <div className="text-center text-gray-400 text-[12px] leading-4 mt-1">
          {caption}
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
}
