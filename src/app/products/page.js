"use client";

/**
 * Product Marketplace (Affiliate) — PROD (Aligned Cards Fix)
 * - 1 / 2 / 3 columns responsive grid
 * - Card parallelism: title/desc clamp + fixed min-heights + actions pinned to bottom (mt-auto)
 * - "Added" button style improved (premium soft green)
 * - Small perf tweaks: useMemo filtering, useEffect (no layout effect), stable computed strings
 */

import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import {
  BadgePercent,
  MousePointerClick,
  Activity,
  Coins,
  Link2,
  Search,
  Ban,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { apiFetch } from "@/lib/apiFetch";

const PLACEHOLDER = "https://placehold.co/240x240?text=Product";

const CARD_BG = "#181818";
const CARD_BORDER = "#232323";
const SURFACE_GREY = "#232323";
const SURFACE_GREY_BORDER = "#343a34";
const ACCENT = "#81d742";

const money = (n) =>
  `₺${Number(n || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const perSale = (p) => Math.max(0, (Number(p.price || 0) * Number(p.commissionRate || 0)) / 100);

function handleImgError(e) {
  e.currentTarget.onerror = null;
  e.currentTarget.src = PLACEHOLDER;
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const { setUser } = useUser();

  const [products, setProducts] = useState([]);
  const [userLinks, setUserLinks] = useState([]);
  const [visibleLinkIds, setVisibleLinkIds] = useState(new Set());

  const [loading, setLoading] = useState(true);
  const [cardLoading, setCardLoading] = useState({});
  const [cardMessages, setCardMessages] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  // Hydration-safe local cache → user context
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
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
    } catch {
      // ignore
    }
  }, [setUser]);

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
        setCardMessages({ global: { kind: "error", text: t("productError") } });
      } finally {
        const left = Math.max(0, MIN - (performance.now() - start));
        setTimeout(() => alive && setLoading(false), left);
      }
    })();

    // Refresh /api/me (best-effort)
    apiFetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.userId) return;
        setUser((u) => ({ ...(u || {}), ...data, role: "affiliate" }));
        try {
          if (typeof window !== "undefined") {
            if (data.username) localStorage.setItem("cabo_username", data.username);
            if (data.email) localStorage.setItem("cabo_email", data.email);
            if (data.userId) localStorage.setItem("cabo_userId", String(data.userId));
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [setUser, t]);

  const hasVisible = (pid) => visibleLinkIds.has(pid);

  const statusOf = (p) =>
    !p.isActive ? "inactive" : p.maxSalesLimit != null && p.totalPurchases >= p.maxSalesLimit ? "quota" : "active";

  const quotaLeft = (p) =>
    p.maxSalesLimit == null ? Infinity : Math.max(0, Number(p.maxSalesLimit) - Number(p.totalPurchases || 0));

  function flash(productId, text, kind = "success") {
    setCardMessages((s) => ({ ...s, [productId]: { kind, text } }));
    setTimeout(() => {
      setCardMessages((s) => {
        const copy = { ...s };
        delete copy[productId];
        return copy;
      });
    }, 2000);
  }

  async function promoteProduct(productId) {
    if (hasVisible(productId)) return;
    setCardLoading((s) => ({ ...s, [productId]: true }));
    try {
      const res = await apiFetch("/api/products/promote", {
        method: "POST",
        body: { productId },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        flash(productId, t("productSuccess"), "success");
        setUserLinks((prev) => {
          const ex = prev.find((l) => l.productId === productId);
          if (ex) return prev.map((l) => (l.productId === productId ? { ...l, isVisible: true } : l));
          return [...prev, { productId, token: data.token, isVisible: true, expiresAt: data.expiresAt || null }];
        });
        setVisibleLinkIds((prev) => new Set(prev).add(productId));
      } else {
        flash(productId, data?.error || t("productError"), "error");
      }
    } catch {
      flash(productId, t("productError"), "error");
    } finally {
      setCardLoading((s) => ({ ...s, [productId]: false }));
    }
  }

  const normalizedQuery = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

  const filtered = useMemo(() => {
    if (!normalizedQuery) return products;
    return products.filter((p) => {
      const text = `${p.name || ""} ${p.description || ""}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [products, normalizedQuery]);

  return (
    <Layout>
      {/* Header + Search */}
      <div className="flex flex-col items-center mt-10 mb-6 px-3">
        <h1 className="text-4xl md:text-6xl font-extrabold text-[#d1ffd0] tracking-tight">{t("productMarketplace")}</h1>
        <p className="mt-3 text-base md:text-lg text-gray-200 font-mono opacity-90 text-center max-w-2xl">
          {t("productSubtitle")}
        </p>

        <div className="mt-5 w-full flex justify-center">
          <div className="relative w-full max-w-[720px]">
            <input
              type="text"
              className="w-full rounded-xl px-4 py-3 pl-11 text-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-[#888]/30 placeholder:text-gray-400 transition shadow-sm"
              style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
              placeholder="Search for product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
              inputMode="search"
              aria-label="Search products"
            />
            <Search size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#aaa]" />
            {!!searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white text-xs px-2 py-1 rounded hover:opacity-90"
                style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className={`w-full mx-auto px-3 md:px-8 pb-14 ${loading ? "opacity-60" : "opacity-100"} max-w-[1360px]`}>
        {cardMessages.global?.text && (
          <div
            className="mb-5 text-center font-mono font-bold rounded-lg px-5 py-3 max-w-lg mx-auto text-base"
            style={{
              color: cardMessages.global.kind === "error" ? "#ffd9a8" : ACCENT,
              background: cardMessages.global.kind === "error" ? "#2a1f12" : "#202820",
              border: cardMessages.global.kind === "error" ? "1px solid #5a3a14" : "1px solid #263826",
            }}
          >
            {cardMessages.global.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-7 gap-y-9 justify-items-stretch">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl"
                  style={{
                    background: CARD_BG,
                    border: `1px solid ${CARD_BORDER}`,
                    height: 520,
                    width: "100%",
                  }}
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
                    className="relative rounded-2xl shadow-lg transition-transform duration-200 ease-out will-change-transform w-full flex flex-col"
                    style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                  >
                    {/* Top chips */}
                    <div className="px-5 pt-4 grid grid-cols-2 gap-3 items-start">
                      <div className="min-w-0">
                        <Chip text={`${t("productPrice")}: ${money(p.price || 0)}`} />
                      </div>
                      <div className="min-w-0 justify-self-end max-w-full">
                        <Chip
                          icon={<BadgePercent size={16} />}
                          text={`${Number(p.commissionRate || 0).toFixed(2)}% ${t("productCommission")}`}
                          tone="accent"
                        />
                      </div>
                    </div>

                    {/* Visual + title + desc (fixed heights for alignment) */}
                    <div className="px-6 pt-4 flex flex-col items-center text-center">
                      <div
                        className="rounded-xl overflow-hidden"
                        style={{
                          width: "min(12rem, 78%)",
                          height: "min(12rem, 64vw)",
                          background: SURFACE_GREY,
                          border: `1px solid ${SURFACE_GREY_BORDER}`,
                        }}
                      >
                        <img
                          src={p.imageUrl || PLACEHOLDER}
                          alt={p.name || "product"}
                          className="object-cover w-full h-full transition-transform duration-300"
                          onError={handleImgError}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Title: 2 lines clamp + fixed minHeight to keep actions aligned */}
                      <h2
                        className="mt-4 text-[1.45rem] md:text-[1.55rem] font-extrabold text-white leading-tight w-full"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          wordBreak: "break-word",
                          minHeight: "3.6em", // ~2 lines
                        }}
                        title={p.name || ""}
                      >
                        {p.name}
                      </h2>

                      {/* Desc: 2 lines clamp + fixed minHeight */}
                      <p
                        className="mt-2 text-gray-300 text-[14px] md:text-[15px] leading-6 w-full"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          maxWidth: "46ch",
                          minHeight: "3.0em", // ~2 lines
                        }}
                        title={p.description || ""}
                      >
                        {p.description || ""}
                      </p>
                    </div>

                    {/* status badge */}
                    {disabled && (
                      <div className="absolute left-5 top-[64px] md:top-[74px]">
                        <span className="flex items-center gap-1 bg-red-700/90 text-white px-3 py-1 rounded-full text-xs">
                          <Ban size={13} /> {status === "inactive" ? t("productInactive") : t("productQuota")}
                        </span>
                      </div>
                    )}

                    {/* Metrics */}
                    <div className="px-6 pt-4 grid grid-cols-2 gap-4 items-stretch">
                      <MetricBox
                        className="h-[96px]"
                        label={t("clicks")}
                        icon={<MousePointerClick size={16} />}
                        value={p.totalClicks || 0}
                        caption={t("totalClicks")}
                      />
                      <MetricBox
                        className="h-[96px]"
                        label={t("sales")}
                        icon={<Activity size={16} />}
                        value={p.totalPurchases || 0}
                        caption={t("totalSales")}
                      />
                      <MetricBox
                        className="h-[96px]"
                        label={t("productEarn")}
                        icon={<Coins size={16} />}
                        value={
                          <span
                            className="font-extrabold tabnums text-base md:text-lg whitespace-nowrap"
                            style={{ color: ACCENT }}
                            title={money(earn)}
                          >
                            {money(earn)}
                          </span>
                        }
                        caption={t("perSale") || "per sale"}
                      />
                      <MetricBox
                        className="h-[96px]"
                        label={t("quotaLeft")}
                        value={isFinite(quota) ? quota : "∞"}
                        caption={t("remaining") || "remaining"}
                      />
                    </div>

                    {/* Inline notice */}
                    {cardMessages[p.productId]?.text && (
                      <div
                        aria-live="polite"
                        className="mx-6 mt-3 rounded-lg px-3 py-2 text-sm font-mono flex items-center gap-2"
                        style={{
                          background: cardMessages[p.productId].kind === "error" ? "#2a1f12" : "#202820",
                          border:
                            cardMessages[p.productId].kind === "error"
                              ? "1px solid #5a3a14"
                              : "1px solid #263826",
                          color: cardMessages[p.productId].kind === "error" ? "#ffd9a8" : ACCENT,
                        }}
                      >
                        {cardMessages[p.productId].kind === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                        <span className="break-words">{cardMessages[p.productId].text}</span>
                      </div>
                    )}

                    {/* Actions pinned to bottom */}
                    <div className="px-6 pb-5 pt-4 mt-auto">
                      {disabled ? (
                        <button
                          type="button"
                          disabled
                          className="w-full rounded-xl font-mono font-bold py-3 text-gray-400 cursor-not-allowed"
                          style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
                        >
                          {status === "inactive" ? t("productInactive") : t("productQuota")}
                        </button>
                      ) : has ? (
                        <>
                          <button
                            type="button"
                            disabled
                            className="w-full rounded-xl font-mono font-bold py-3 text-gray-100"
                            style={{
                              background: "linear-gradient(180deg, rgba(129,215,66,0.18), rgba(129,215,66,0.10))",
                              border: "1px solid rgba(129,215,66,0.28)",
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 22px rgba(0,0,0,0.22)",
                              color: "#eaffea",
                            }}
                          >
                            {t("productAdded")}
                          </button>
                          <div className="flex items-center justify-center gap-1 mt-2 text-gray-400 text-xs font-mono">
                            <Link2 size={14} />
                            {t("productManage")}{" "}
                            <a href="/mylinks" className="underline ml-1 hover:text-gray-200">
                              {t("productMyLinks")}
                            </a>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => promoteProduct(p.productId)}
                          disabled={!!cardLoading[p.productId]}
                          className="w-full rounded-xl font-black font-mono py-3 text-[#0e1a0c] shadow-lg hover:shadow-xl transition disabled:opacity-70 disabled:cursor-not-allowed"
                          style={{
                            background: "linear-gradient(180deg, rgba(129,215,66,1), rgba(99,190,46,1))",
                            border: "1px solid rgba(129,215,66,0.55)",
                          }}
                        >
                          {cardLoading[p.productId] ? t("loading") : t("productGetLink")}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
        </div>
      </div>

      <style jsx global>{`
        .tabnums { font-variant-numeric: tabular-nums; }
      `}</style>
    </Layout>
  );
}

/* ---------- UI Bits ---------- */

function Chip({ icon, text, tone = "default" }) {
  const base = {
    color: tone === "accent" ? "#eaffea" : "#f3f3f3",
    background: tone === "accent" ? "rgba(129,215,66,0.12)" : SURFACE_GREY,
    border: tone === "accent" ? "1px solid #2d5b2d" : `1px solid ${SURFACE_GREY_BORDER}`,
    boxShadow:
      tone === "accent"
        ? "inset 0 1px 0 rgba(255,255,255,0.05)"
        : "inset 0 1px 0 rgba(255,255,255,0.03)",
    borderRadius: "12px",
    whiteSpace: "nowrap",
    lineHeight: 1.15,
  };
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 text-[13px] font-semibold max-w-full"
      style={base}
      title={typeof text === "string" ? text : undefined}
    >
      <span className="opacity-90 truncate">{text}</span>
      {icon ? <span className="opacity-90 shrink-0">{icon}</span> : null}
    </span>
  );
}

function MetricBox({ icon, label, value, caption, className = "" }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 grid grid-rows-[auto,1fr,auto] ${className}`}
      style={{ background: SURFACE_GREY, border: `1px solid ${SURFACE_GREY_BORDER}` }}
      title={typeof label === "string" ? label : undefined}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-gray-300 text-sm font-medium text-center">{label}</span>
        {icon ? <span className="text-gray-300 shrink-0">{icon}</span> : null}
      </div>
      <div className="flex items-center justify-center text-white font-bold tabnums mt-2 max-w-full">{value}</div>
      <div className="text-center text-gray-400 text-[12px] leading-4 min-h-4">{caption ? caption : "\u00A0"}</div>
    </div>
  );
}
