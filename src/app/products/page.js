'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { ShoppingCart, BadgePercent, Link2, Ban, Search } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { useTranslation } from '@/hooks/useTranslation';

const PLACEHOLDER = "https://placehold.co/128x128?text=Product";
function handleImgError(e) {
  e.target.onerror = null;
  e.target.src = PLACEHOLDER;
}
function getCurrencySymbol() { return "₺"; }
function calcEarnings(product) {
  const price = Number(product.price) || 20;
  const pct = Number(product.commission_rate) || 0;
  return (price * pct / 100).toFixed(2);
}
function getExpiresBadge(product, userLinks, t) {
  const userLink = userLinks.find(l => l.product_id === product.product_id && l.is_visible);
  if (!userLink || !userLink.expires_at) return null;
  const expires = new Date(userLink.expires_at);
  const now = new Date();
  const diffMs = expires - now;
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return (
    <span className={`absolute right-4 top-4 px-3 py-1 rounded-full text-xs font-mono border transition
      ${daysLeft > 0
        ? 'bg-[#244d24]/80 text-[#d1ffd0] border-[#2c7c2c]'
        : 'bg-[#391818]/80 text-[#ffbbbb] border-[#a03939]'
      }`}>
      {daysLeft > 0 ? `${t("productExpiresIn")} ${daysLeft}d` : t("productExpired")}
    </span>
  );
}

export default function ProductsPage() {
  const t = useTranslation();
  const [products, setProducts] = useState([]);
  const [userLinks, setUserLinks] = useState([]);
  const [visibleLinkIds, setVisibleLinkIds] = useState(new Set());
  const [loading, setLoading] = useState(true); // Global loading sadece ilk veri için
  const [cardLoading, setCardLoading] = useState({}); // Her kart için ayrı loading!
  const [cardMessages, setCardMessages] = useState({});
  const [searchTerm, setSearchTerm] = useState(""); // <-- ARAMA

  const { user, setUser } = useUser();

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        setProducts(data.products || []);
        setUserLinks(data.userLinks || []);
        setVisibleLinkIds(
          new Set(
            (data.userLinks || [])
              .filter(l => l.is_visible)
              .map(l => l.product_id)
          )
        );
      } catch (err) {
        setCardMessages({ global: t("productError") });
        setProducts([]);
        setUserLinks([]);
        setVisibleLinkIds(new Set());
      }
      setLoading(false);
    }
    loadData();
    const cached = typeof window !== "undefined" && localStorage.getItem("cabo_user");
    if (cached) setUser(JSON.parse(cached));
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.user_id) {
          setUser(data);
          localStorage.setItem("cabo_user", JSON.stringify(data));
        }
      });
    // eslint-disable-next-line
  }, [setUser]);

  const userHasVisibleLink = pid => visibleLinkIds.has(pid);

  const promoteProduct = async (product_id) => {
    if (userHasVisibleLink(product_id)) return;
    setCardLoading(prev => ({ ...prev, [product_id]: true })); // Sadece bu kart loading!
    setCardMessages(prev => ({ ...prev, [product_id]: "" }));
    try {
      const res = await fetch('/api/products/promote', {
        method: "POST",
        body: JSON.stringify({ product_id }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        setCardMessages(prev => ({
          ...prev,
          [product_id]: t("productSuccess")
        }));
        const data = await res.json();
        setUserLinks(prev => {
          const exists = prev.find(l => l.product_id === product_id);
          if (exists) {
            return prev.map(l =>
              l.product_id === product_id ? { ...l, is_visible: true, expires_at: data.expires_at } : l
            );
          }
          return [...prev, { product_id, token: data.token, is_visible: true, expires_at: data.expires_at }];
        });
        setVisibleLinkIds(prev => {
          const copy = new Set(prev);
          copy.add(product_id);
          return copy;
        });
      } else {
        const data = await res.json();
        setCardMessages(prev => ({
          ...prev,
          [product_id]: data.error || t("productError")
        }));
      }
    } catch (err) {
      setCardMessages(prev => ({
        ...prev,
        [product_id]: t("productError")
      }));
    }
    setCardLoading(prev => ({ ...prev, [product_id]: false })); // Loading kapat
    setTimeout(() => setCardMessages(prev => ({ ...prev, [product_id]: "" })), 1800); // Hızlıca kapat
  };

  function isProductInactiveOrQuotaFull(product) {
    if (!product.is_active) return "inactive";
    if (product.max_sales_limit != null && product.total_purchases >= product.max_sales_limit) return "quota";
    return null;
  }

  // --- ARAMA: Ürünleri filtrele ---
  const filteredProducts = products.filter(product => {
    if (!searchTerm.trim()) return true;
    const text = (product.name || "") + " " + (product.description || "");
    return text.toLowerCase().includes(searchTerm.trim().toLowerCase());
  });

  return (
    <Layout>
      <div className="flex flex-col items-center mt-12 mb-6 px-2 sm:px-0">
        <div className="flex flex-row items-center gap-3">
          <ShoppingCart size={42} className="text-[#d1ffd0] drop-shadow-xl" />
          <h1 className="text-4xl md:text-6xl font-extrabold text-[#d1ffd0] tracking-tight drop-shadow-2xl font-sans" style={{ lineHeight: "1.13" }}>
            {t("productMarketplace")}
          </h1>
        </div>
        <p className="mt-4 text-base md:text-lg text-gray-200 font-mono font-medium opacity-90 text-center max-w-2xl">
          {t("productSubtitle")}
        </p>

      {/* ARAMA KUTUSU */}
      <div className="mt-5 w-full flex justify-center">
        <div className="relative w-full max-w-[400px]">
          <input
            type="text"
            className="w-full rounded-xl bg-[#232323] border border-[#343a34] px-4 py-2 pl-10 text-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-[#888]/40 placeholder:text-gray-400 transition shadow-sm"
            placeholder="Search for product..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ boxShadow: "0 2px 10px #161a1830" }}
            autoComplete="off"
          />
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#aaa]" />
          {searchTerm && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#343434] hover:bg-[#242424] text-white px-2 py-1 rounded transition text-xs font-mono"
              style={{ fontSize: 14, lineHeight: 1 }}
              onClick={() => setSearchTerm("")}
              tabIndex={-1}
              aria-label="Clear search"
              type="button"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      </div>
      <div className="w-full max-w-7xl mx-auto px-2 md:px-8 pb-14 flex-1">
        {/* Global error mesajı */}
        {cardMessages.global && (
          <div className="mb-4 text-center font-mono font-bold text-[#81d742] bg-[#202820] border border-[#263826] rounded-lg px-5 py-3 shadow max-w-lg mx-auto text-base animate-fadeIn">
            {cardMessages.global}
          </div>
        )}
        <div
          className={`
            grid
            grid-cols-1
            xs:grid-cols-2
            md:grid-cols-3
            xl:grid-cols-4
            gap-x-7 gap-y-14
            justify-center
            items-start
            mobile-products-grid
          `}
        >
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl bg-[#191c1a] border border-[#232623] h-[360px]" />
            ))
          ) : filteredProducts.map(product => {
            const claimed = userHasVisibleLink(product.product_id);
            const status = isProductInactiveOrQuotaFull(product);

            return (
              <div
                key={product.product_id}
                className={`
                  relative flex flex-col items-center p-6 pt-8 pb-8
                  rounded-xl border border-[#232623]/70 shadow min-h-[340px]
                  group transition bg-[#181818]
                  ${status ? 'opacity-60 grayscale' : ''}
                `}
                style={{ minWidth: 240, maxWidth: 320 }}
              >
                {/* FEEDBACK - ürün özel mesajı */}
                {cardMessages[product.product_id] && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-3 z-20"
                    style={{
                      pointerEvents: "none",
                      minWidth: 180,
                      background: "#202820",
                      border: "1.5px solid #263826",
                      padding: "8px 18px",
                      borderRadius: 12,
                      fontFamily: "monospace",
                      color: "#81d742",
                      textAlign: "center",
                      fontSize: 13,
                      boxShadow: "0 8px 16px #0a190a30"
                    }}
                  >
                    {cardMessages[product.product_id]}
                  </div>
                )}

                {/* Status badges */}
                {status === "inactive" && (
                  <span className="absolute left-4 top-4 bg-red-700/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                    <Ban size={13} /> {t("productInactive")}
                  </span>
                )}
                {status === "quota" && (
                  <span className="absolute left-4 top-4 bg-yellow-600/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                    <Ban size={13} /> {t("productQuota")}
                  </span>
                )}
                {/* Expiry badge */}
                {getExpiresBadge(product, userLinks, t)}

                <span className="flex flex-row items-center gap-1 bg-[#23262a] text-gray-200 font-bold rounded-lg px-3 py-1 mb-3 text-xs uppercase border border-[#282c2f] shadow-sm">
                  <BadgePercent size={14} className="inline mr-1 text-gray-400" />
                  {Number(product.commission_rate).toFixed(2)}% {t("productCommission")}
                </span>

                <div className="w-28 h-28 rounded-xl bg-[#22262a] mb-4 flex items-center justify-center shadow-inner border border-[#282c2f]/50 overflow-hidden">
                  <img
                    src={product.image_url || PLACEHOLDER}
                    alt={product.name}
                    className="object-cover w-full h-full rounded-xl group-hover:scale-[1.04] transition"
                    onError={handleImgError}
                  />
                </div>

                <div className="font-black text-lg md:text-xl text-gray-100 text-center mb-2 tracking-tight drop-shadow">
                  {product.name}
                </div>
                <div className="text-[15px] text-gray-400 font-mono text-center mb-3 min-h-[38px] font-medium">
                  {product.description?.substring(0, 110) || ""}
                </div>

                <div className="flex flex-row items-center justify-center gap-2 mb-3 w-full">
                  <span className="bg-[#23262a] text-gray-200 px-3 py-1 rounded-lg font-bold text-xs shadow-inner border border-[#26292d]/40 flex items-center gap-1 whitespace-nowrap">
                    {t("productPrice")} {getCurrencySymbol()}{product.price ? Number(product.price).toFixed(2) : "20.00"}
                  </span>
                  <span className="bg-[#22262a] px-3 py-1 rounded-lg font-bold text-xs shadow-inner border border-[#282c2f]/50 flex items-center gap-1 whitespace-nowrap">
                    <span className="text-gray-200">{t("productEarn")}:</span>
                    <span className="ml-1 text-[#81d742] font-extrabold">{getCurrencySymbol()}{calcEarnings(product)}</span>
                  </span>
                </div>

                <div className="flex items-center justify-center gap-6 mb-4 w-full text-sm text-gray-300">
                  <span>{t("totalClicks")}: {product.total_clicks}</span>
                  <span>{t("totalSales")}: {product.total_purchases}</span>
                </div>

                <div className="flex-1" />
                {status ? (
                  <button
                    className="w-full bg-[#23262a] text-gray-400 font-mono font-bold py-2 rounded-xl mt-1 shadow transition cursor-not-allowed border border-[#272b2e]/40 opacity-70"
                    disabled
                  >
                    {status === "inactive" ? t("productInactive") : t("productQuota")}
                  </button>
                ) : claimed ? (
                  <>
                    <button
                      className="w-full bg-[#23262a] text-gray-400 font-mono font-bold py-2 rounded-xl mt-1 shadow transition opacity-90 cursor-not-allowed border border-[#272b2e]/40"
                      disabled
                    >
                      {t("productAdded")}
                    </button>
                    <div className="flex flex-row items-center gap-1 justify-center mt-1 text-gray-500 font-mono text-xs">
                      <Link2 size={14} /> {t("productManage")}
                      <span className="underline ml-1">{t("productMyLinks")}</span>
                    </div>
                  </>
                ) : (
                  <button
                    className="w-full bg-[#23262a] text-[#d1ffd0] font-black font-mono py-2.5 rounded-2xl mt-3 mb-1 shadow-lg hover:bg-[#81d742] hover:text-[#181818] hover:scale-[1.01] transition text-base tracking-tight border border-[#282c2f]/50"
                    onClick={() => promoteProduct(product.product_id)}
                    disabled={!!cardLoading[product.product_id]} // Sadece o kart loading!
                  >
                    {cardLoading[product.product_id]
                      ? <span className="animate-pulse">{t("loading")}</span>
                      : t("productGetLink")}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* No products */}
        {!loading && filteredProducts.length === 0 && (
          <div className="text-center text-[#f87171] text-lg font-mono py-16 flex flex-col items-center justify-center">
            <ShoppingCart size={32} className="mx-auto mb-2 text-[#f87171]" />
            <span className="font-bold text-2xl">No products found</span>
            <p className="text-[#a9bfb5] text-base mt-1 font-mono">
              {t("productCheckBack")}
            </p>
          </div>
        )}
      </div>
      {/* Mobil görünümde ortalama ve spacing */}
      <style jsx global>{`
        @media (max-width: 640px) {
          .mobile-products-grid {
            justify-items: center !important;
            align-items: flex-start !important;
            gap-x: 20px !important;
            gap-y: 28px !important;
            margin-top: 38px !important;
            padding-left: 6vw !important;
            padding-right: 6vw !important;
          }
          .mobile-products-grid > div {
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }
        @media (max-width: 640px) {
          .flex.flex-col.items-center.mt-12.mb-6.px-2 {
            margin-bottom: 22px !important;
          }
        }
      `}</style>
    </Layout>
  );
}
