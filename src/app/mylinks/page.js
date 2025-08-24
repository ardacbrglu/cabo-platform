// app/mylinks/page.js
"use client";

import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { Link2, ShoppingCart, BarChart2, Copy, X, RotateCcw } from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";

const PLACEHOLDER = "https://placehold.co/128x128?text=Product";
function handleImgError(e) { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER; }

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
      className={`inline-block px-2 py-1 rounded font-mono text-xs border ml-1 ${
        daysLeft > 0
          ? "bg-[#244d24]/80 text-[#d1ffd0] border-[#2c7c2c]"
          : "bg-[#391818]/80 text-[#ffbbbb] border-[#a03939]"
      }`}
    >
      {daysLeft > 0 ? `${t("productExpiresIn")} ${daysLeft}d` : t("productExpired")}
    </span>
  );
}

export default function MyLinksPage() {
  const [links, setLinks] = useState([]);
  const [copiedToken, setCopiedToken] = useState(null);
  const [removingTokens, setRemovingTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { user, setUser } = useUser();
  const { t } = useTranslation();

  // Kullanıcı bilgisi
  useEffect(() => {
    if (!user?.name) {
      fetch("/api/me", { cache: "no-store", credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.name) {
            setUser((u) => ({
              ...u,
              name: data.name,
              email: data.email,
              userId: data.userId,
              role: data.role,
              currencyCode: data.currencyCode || "TRY",
            }));
          }
        })
        .catch(() => {});
    }
  }, [user, setUser]);

  // Linkler
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/mylinks", { cache: "no-store", credentials: "include" })
      .then((res) => (res.ok ? res.json() : { links: [] }))
      .then((data) => { if (alive) setLinks(Array.isArray(data.links) ? data.links : []); })
      .catch(() => { if (alive) setLinks([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  const doRefresh = () => setReloadKey((k) => k + 1);

  const copyLink = (token) => {
    const full = `${window.location.origin}/ref/${token}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(full).catch(() => {});
    } else {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = full;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const removeLink = async (token) => {
    try {
      const res = await fetch("/api/mylinks", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest", // same-origin AJAX şartı
        },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        setRemovingTokens((prev) => [...prev, token]);
        setTimeout(() => {
          setLinks((prev) => prev.filter((link) => link.token !== token));
          setRemovingTokens((prev) => prev.filter((t) => t !== token));
        }, 300);
      } else {
        console.warn("Failed to hide link:", await res.text());
      }
    } catch (err) {
      console.error("Failed to hide link:", err);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col items-center mt-12 mb-6 px-2 sm:px-0">
        <div className="flex items-center gap-3">
          <Link2 size={44} className="text-[#d1ffd0] drop-shadow-xl" />
          <h1
            className="text-4xl md:text-6xl font-extrabold text-[#d1ffd0] tracking-tight drop-shadow-2xl font-sans"
            style={{ lineHeight: "1.13" }}
          >
            {t("myLinks")}
          </h1>
        </div>
        <p className="mt-4 text-base md:text-lg text-gray-200 font-mono font-medium opacity-90 text-center max-w-2xl">
          {t("myLinksSubtitle") || "Here are your claimed affiliate links with real-time stats."}
        </p>

        {/* Refresh */}
        <button
          onClick={doRefresh}
          className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-[#caffb6] hover:bg-[#222] transition disabled:opacity-60"
          title="Refresh"
          type="button"
          disabled={loading}
        >
          <RotateCcw size={18} className={loading ? "animate-spin" : ""} />
          <span className="text-sm">{loading ? (t("processing") || "Processing...") : "Refresh"}</span>
        </button>
      </div>

      <div className="w-full max-w-7xl mx-auto px-2 md:px-8 pb-14 flex-1">
        {(!links || links.length === 0) && !loading ? (
          <div className="text-center text-gray-400 font-mono text-lg py-24">
            {t("myLinksEmpty") || "You haven't claimed any links yet."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-9 gap-x-6 md:gap-x-8">
            {links.map((link) => {
              const isRemoving = removingTokens.includes(link.token);

              // Ürün tamamen kaldırılmışsa
              if (!link.product) {
                return (
                  <div
                    key={link.token}
                    className={`bg-[#181818] border border-[#872222] rounded-xl shadow-md p-6 flex flex-col justify-between transition-all duration-300 ease-in-out ${
                      isRemoving ? "opacity-0 translate-y-3 pointer-events-none" : ""
                    }`}
                  >
                    <div className="text-red-400 font-bold mb-2">
                      {t("myLinksRemoved") || "This product is no longer available."}
                    </div>
                    <button
                      onClick={() => removeLink(link.token)}
                      className="mt-4 text-red-400 text-xs font-mono hover:underline flex items-center gap-1"
                    >
                      <X size={14} /> {t("removeFromDashboard") || "Remove from dashboard"}
                    </button>
                  </div>
                );
              }

              // Ürün aktif değilse / kota doluysa
              if (link.product.isActive === false) {
                return (
                  <div
                    key={link.token}
                    className={`bg-[#232016] border border-[#876d0f] rounded-xl shadow-md p-6 flex flex-col justify-between opacity-70 transition-all duration-300 ease-in-out ${
                      isRemoving ? "opacity-0 translate-y-3 pointer-events-none" : ""
                    }`}
                  >
                    <div className="font-bold text-yellow-400 mb-2">
                      {t("productInactiveOrQuota") || "This product is now inactive or sales quota reached."}
                    </div>
                    <div className="text-gray-400 font-mono mb-2">
                      {t("productNoCommission") || "You can't earn commission on this link anymore."}
                    </div>
                    <button
                      onClick={() => removeLink(link.token)}
                      className="mt-2 text-red-400 text-xs font-mono hover:underline flex items-center gap-1"
                    >
                      <X size={14} /> {t("removeFromDashboard") || "Remove from dashboard"}
                    </button>
                  </div>
                );
              }

              // Aktif ürün kartı
              return (
                <div
                  key={link.linkId}
                  className={`bg-[#181818] border border-[#272727] rounded-xl shadow-md px-4 py-5 sm:p-6 flex flex-col justify-between transition-all duration-300 ease-in-out hover:shadow-lg ${
                    isRemoving ? "opacity-0 translate-y-3 pointer-events-none" : ""
                  }`}
                  style={{ maxWidth: "420px", width: "100%", margin: "0 auto" }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-[#22262a] rounded-lg overflow-hidden border border-[#2a2e31] flex items-center justify-center">
                      <img
                        src={link.product.image_url || PLACEHOLDER}
                        alt={link.product.name}
                        className="object-cover w-full h-full"
                        onError={handleImgError}
                      />
                    </div>
                    <div>
                      <div className="text-gray-100 font-bold text-lg flex items-center">
                        {link.product.name}
                        {getExpiresBadge(link, t)}
                      </div>
                      <div className="text-gray-400 text-sm font-mono mt-1">
                        {link.product.description?.substring(0, 60)}
                      </div>
                    </div>
                  </div>

                  <div className="text-sm font-mono text-gray-300 mb-1">
                    <span className="text-gray-500">{t("productEarn") || "Earnings per sale"}:</span>{" "}
                    <span className="text-[#81d742] font-bold">
                      {getCurrencySymbol(user?.currencyCode || "TRY")}
                      {(((link.product.price || 20) * (link.product.commissionRate || 0)) / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-gray-500 mb-2 flex flex-row items-center gap-3">
                    <span>
                      <ShoppingCart size={13} className="inline mr-1" /> <b>{link.user_sales_count}</b>{" "}
                      {t("productPurchases") || "purchases"}
                    </span>
                    <span>
                      <BarChart2 size={13} className="inline mr-1" /> <b>{link.user_click_count}</b>{" "}
                      {t("productClicks") || "clicks"}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-gray-500 mb-2">
                    {t("productYourTotalEarnings") || "Your earnings:"}{" "}
                    <b>
                      {getCurrencySymbol(user?.currencyCode || "TRY")}
                      {link.user_earnings.toFixed(2)}
                    </b>
                  </div>

                  {/* Kalan komisyon hakkı */}
                  <div className="text-xs font-mono text-[#81d742] mb-2">
                    {typeof link.product.remaining_sales === "number" && link.product.remaining_sales > 0 ? (
                      <span>
                        {t("productCanEarn")} <b>{link.product.remaining_sales}</b> {t("productMoreCommission")}
                        {link.product.remaining_sales > 1 ? "s" : ""}!
                      </span>
                    ) : (
                      <span className="text-red-400">
                        {t("productNoMoreCommission") || "No more commission available for this product."}
                      </span>
                    )}
                  </div>

                  {/* Kopyalanabilir link */}
                  <div className="bg-[#232323] px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-gray-2 00 text-sm border border-[#2c2c2c]">
                    <span className="truncate">
                      {typeof window !== "undefined" ? window.location.origin : ""}/ref/{link.token}
                    </span>
                    <button onClick={() => copyLink(link.token)} className="text-gray-400 hover:text-white transition">
                      {copiedToken === link.token ? (
                        <span className="text-green-400 font-mono text-xs">{t("copied") || "Copied!"}</span>
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => removeLink(link.token)}
                    className="mt-4 text-red-400 text-xs font-mono hover:underline flex items-center gap-1"
                  >
                    <X size={14} /> {t("removeFromDashboard") || "Remove from dashboard"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media (max-width: 640px) {
          .grid {
            gap-y: 20px !important;
            gap-x: 3vw !important;
            justify-items: center !important;
          }
          .flex.flex-col.items-center.mt-12.mb-6.px-2.sm\\:px-0 {
            margin-bottom: 28px !important;
          }
        }
      `}</style>
    </Layout>
  );
}
