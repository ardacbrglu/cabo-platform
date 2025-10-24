"use client"; 

/**
 * Affiliate “My Links” — PROD READY
 * - Kopyalanan URL: merchantUrl?token=...&lid=...
 * - Backend (/api/mylinks) her link için shareUrl veriyor; UI doğrudan onu kopyalar.
 * - Fallback: merchant_url yoksa en sonda /ref/{token}?lid=... kullanılır.
 */

import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { Link2, ShoppingCart, BarChart2, Copy, X, Ban, CheckCircle2 } from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { apiFetch } from "@/lib/apiFetch";

const PLACEHOLDER = "https://placehold.co/160x160?text=Product";
const CARD_BG = "#181818";
const CARD_BORDER = "#232323";
const SURFACE = "#232323";
const SURFACE_BORDER = "#343a34";
const ACCENT = "#81d742";

function handleImgError(e) { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER; }

// ---- base url helper (client-safe) ----
const ENV_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_BASE_URL) || "";

function getBaseUrl() {
  const fromEnv = (ENV_BASE || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function getCurrencySymbol(currency = "TRY") {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "TRY") return "₺";
  return "₺";
}

function getExpiresBadge(link, t) {
  if (!link.expiresAt) return null;
  const expires = new Date(link.expiresAt);
  const now = new Date();
  const diffMs = expires - now;
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return (
    <span
      className={`inline-block px-2 py-1 rounded font-mono text-xs border ml-2 ${
        daysLeft > 0
          ? "bg-[#244d24]/80 text-[#d1ffd0] border-[#2c7c2c]"
          : "bg-[#391818]/80 text-[#ffbbbb] border-[#a03939]"
      }`}
    >
      {daysLeft > 0 ? `${t("productExpiresIn")} ${daysLeft}d` : t("productExpired")}
    </span>
  );
}

/* Desktop hover hareketi için tek bir sınıf */
const CARD_HOVER =
  "will-change-transform transition-all duration-200 ease-out " +
  "motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-[0_12px_28px_rgba(0,0,0,.35)] " +
  "hover:border-[#2e2e2e]";

export default function MyLinksPage() {
  const [links, setLinks] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null); // linkId-based
  const [removing, setRemoving] = useState({});
  const [loading, setLoading] = useState(false);
  const { user, setUser } = useUser();
  const { t } = useTranslation();

  // Navbar senkron
  useEffect(() => {
    if (!user?.name) {
      apiFetch("/api/me")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setUser((u) => ({
            ...(u || {}),
            name: data.name,
            email: data.email,
            userId: data.userId,
            role: data.role,
            currencyCode: data.currencyCode || "TRY",
          }));
        })
        .catch(() => {});
    }
  }, [user, setUser]);

  // Linkleri çek
  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch("/api/mylinks", { method: "GET", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { links: [] }))
      .then((data) => { if (alive) setLinks(Array.isArray(data.links) ? data.links : []); })
      .catch(() => { if (alive) setLinks([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const baseUrl = getBaseUrl();

  // merchantUrl üstüne token+lid eklemek için küçük yardımcı
  function buildShareFromProduct(link) {
    const m = link?.product?.merchant_url || link?.product?.merchantUrl;
    if (!m) return null;
    try {
      const u = new URL(m);
      if (!u.searchParams.has("token")) u.searchParams.set("token", link.token);
      if (!u.searchParams.has("lid"))   u.searchParams.set("lid", String(link.linkId));
      return u.toString();
    } catch { return null; }
  }
  function fallbackRef(base, link) {
    if (!base) return null;
    return `${base}/ref/${encodeURIComponent(link.token)}?lid=${link.linkId}`;
  }

  const copyLink = (link) => {
    const full =
      link.shareUrl ||
      buildShareFromProduct(link) ||
      fallbackRef(baseUrl, link);
    if (full) navigator?.clipboard?.writeText?.(full).catch(() => {});
    setCopiedKey(link.linkId);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const removeLink = async (link) => {
    setRemoving((s) => ({ ...s, [link.linkId]: true }));
    try {
      const res = await apiFetch("/api/mylinks", {
        method: "POST",
        body: { linkId: link.linkId, productId: link.productId, token: link.token }, // yeni + geri uyum
      });
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.linkId !== link.linkId));
      } else {
        setRemoving((s) => ({ ...s, [link.linkId]: false }));
      }
    } catch {
      setRemoving((s) => ({ ...s, [link.linkId]: false }));
    }
  };

  return (
    <Layout>
      {/* header */}
      <div className="flex flex-col items-center mt-12 mb-6 px-3">
        <div className="flex items-center gap-3">
          <Link2 size={44} className="text-[#d1ffd0] drop-shadow-xl" />
          <h1 className="text-4xl md:text-6xl font-extrabold text-[#d1ffd0] tracking-tight" style={{ lineHeight: "1.13" }}>
            {t("myLinks")}
          </h1>
        </div>
        <p className="mt-4 text-base md:text-lg text-gray-200 font-mono opacity-90 text-center max-w-2xl">
          {t("myLinksSubtitle")}
        </p>
      </div>

      {/* grid */}
      <div className="w-full mx-auto px-3 md:px-8 pb-14 max-w-[1360px]">
        {(!links || links.length === 0) && !loading ? (
          <div className="text-center text-gray-400 font-mono text-lg py-24">{t("myLinksEmpty")}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-7 gap-y-9">
            {(loading ? Array.from({ length: 3 }).map((_, i) => ({ skeleton: true, key: i })) : links).map((link, idx) => {
              const isSkeleton = !!link.skeleton;
              if (isSkeleton) {
                return (
                  <div key={`sk-${idx}`} className="animate-pulse rounded-2xl" style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, height: 360 }} />
                );
              }

              const p = link.product || null;

              // Ürün silinmişse
              if (!p) {
                return (
                  <article
                    key={link.linkId}
                    className={`bg-[${CARD_BG}] border border-[#872222] rounded-2xl p-6 ${CARD_HOVER}`}
                    style={{ background: CARD_BG }}
                  >
                    <div className="text-red-400 font-bold mb-2">{t("myLinksRemoved")}</div>
                    <button
                      onClick={() => removeLink(link)}
                      className="mt-3 text-red-400 text-xs font-mono hover:underline flex items-center gap-1"
                    >
                      <X size={14} /> {t("removeFromDashboard")}
                    </button>
                  </article>
                );
              }

              const imgSrc = p.imageUrl || p.image_url || PLACEHOLDER;
              const remaining = (p.remainingSales ?? p.remaining_sales ?? null);
              const quotaReached = typeof remaining === "number" && remaining <= 0;
              const earnPerSale = (((p.price || 0) * (p.commissionRate || 0)) / 100).toFixed(2);
              const removingThis = !!removing[link.linkId];

              const shareUrl =
                link.shareUrl ||
                (link.product ? buildShareFromProduct(link) : null) ||
                fallbackRef(baseUrl, link);

              return (
                <article
                  key={link.linkId}
                  className={`relative rounded-2xl shadow-lg ${CARD_HOVER} transition-all duration-300 ease-in-out ${removingThis ? "opacity-40 pointer-events-none" : ""}`}
                  style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
                >
                  {(p.isActive === false || quotaReached) && (
                    <div className="absolute left-5 top-5">
                      <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs ${p.isActive === false ? "bg-red-700/90 text-white" : "bg-yellow-700/90 text-white"}`}>
                        <Ban size={13} />
                        {p.isActive === false ? t("inactive") : t("quotaReached")}
                      </span>
                    </div>
                  )}

                  {/* üst: görsel + başlık */}
                  <div className="px-6 pt-6 flex items-center gap-4">
                    <div
                      className="rounded-xl overflow-hidden shrink-0"
                      style={{ width: 72, height: 72, background: SURFACE, border: `1px solid ${SURFACE_BORDER}` }}
                    >
                      <img src={imgSrc} alt={p.name} className="object-cover w-full h-full" onError={handleImgError} loading="lazy" decoding="async" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-gray-100 font-bold text-lg leading-6 break-words">
                        {p.name}
                        {getExpiresBadge(link, t)}
                      </h2>
                      <p className="text-gray-400 text-sm font-mono mt-1 break-words">
                        {(p.description || "").slice(0, 100)}
                      </p>
                    </div>
                  </div>

                  {/* metrikler */}
                  <div className="px-6 mt-4 grid grid-cols-3 gap-3">
                    <TinyMetric label={t("productEarn")} value={<span className="font-extrabold" style={{ color: ACCENT }}>{getCurrencySymbol(user?.currencyCode || "TRY")}{earnPerSale}</span>} />
                    <TinyMetric icon={<ShoppingCart size={14} />} label={t("productPurchases")} value={link.user_sales_count} />
                    <TinyMetric icon={<BarChart2 size={14} />} label={t("productClicks")} value={link.user_click_count} />
                  </div>

                  {/* toplam kazanç */}
                  <div className="px-6 mt-3 text-xs font-mono text-gray-400">
                    {t("productYourTotalEarnings")}:{" "}
                    <b className="text-gray-200">
                      {getCurrencySymbol(user?.currencyCode || "TRY")}
                      {Number(link.user_earnings || 0).toFixed(2)}
                    </b>
                  </div>

                  {/* kalan komisyon hakkı */}
                  {typeof remaining === "number" && (
                    <div className="px-6 mt-2 text-xs font-mono">
                      {remaining > 0 ? (
                        <span className="text-[#81d742]">
                          {t("productCanEarn")} <b>{remaining}</b> {t("productMoreCommission")}
                        </span>
                      ) : (
                        <span className="text-red-400">{t("productNoMoreCommission")}</span>
                      )}
                    </div>
                  )}

                  {/* kopyalanabilir link */}
                  <div className="px-6 mt-4">
                    <div
                      className="px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-gray-200 text-sm"
                      style={{ background: SURFACE, border: `1px solid ${SURFACE_BORDER}` }}
                    >
                      <span className="truncate">{shareUrl}</span>
                      <button onClick={() => copyLink(link)} className="text-gray-400 hover:text-white transition">
                        {copiedKey === link.linkId ? (
                          <span className="text-green-400 font-mono text-xs flex items-center gap-1">
                            <CheckCircle2 size={14} /> {t("copied")}
                          </span>
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* aksiyon */}
                  <div className="px-6 pb-6 mt-4">
                    <button
                      onClick={() => removeLink(link)}
                      className="text-red-400 text-xs font-mono hover:underline flex items-center gap-1"
                      disabled={removingThis}
                    >
                      <X size={14} /> {t("removeFromDashboard")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* reduce-motion için güvenli kapama */}
      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          article { transition: none !important; transform: none !important; }
          article:hover { transform: none !important; box-shadow: none !important; }
        }
      `}</style>
    </Layout>
  );
}

/* --- bits --- */
function TinyMetric({ icon = null, label, value }) {
  return (
    <div
      className="rounded-xl px-3 py-3 text-center"
      style={{ background: SURFACE, border: `1px solid ${SURFACE_BORDER}` }}
      title={typeof label === "string" ? label : undefined}
    >
      <div className="text-[12px] text-gray-300 flex items-center justify-center gap-1">
        {icon ? <span className="text-gray-300">{icon}</span> : null}
        <span className="break-words">{label}</span>
      </div>
      <div className="text-white text-base font-bold mt-1">{value}</div>
    </div>
  );
}
