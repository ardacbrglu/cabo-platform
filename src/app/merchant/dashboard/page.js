"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { PlusCircle, CheckCircle, Eye, EyeOff, Copy, Ban } from "lucide-react";
import MerchantLayout from "@/components/merchant/MerchantLayout";
import { useTranslation } from "@/hooks/useTranslation";
import { useCsrfToken } from "@/hooks/useCsrfToken";

/**
 * SECURITY NOTES
 * - CSRF: POST/PATCH isteklerinde header "x-csrf-token" zorunlu.
 * - Rate-limit + RBAC backend’de (api/merchant_dashboard) uygulanıyor.
 * - XSS: React auto-escape + backend sanitize; img için fallback mevcut.
 */

const PLACEHOLDER = "https://placehold.co/128x128?text=Product";
function handleImgError(e) {
  e.target.onerror = null;
  e.target.src = PLACEHOLDER;
}
function getQuotastatus(product) {
  if (!product.isActive) return "inactive";
  if (product.total_purchases >= product.max_sales_limit) return "quota";
  return null;
}

export default function MerchantDashboardPage() {
  // ❗️ZORUNLU DÜZELTME-1: useTranslation fonksiyonunu doğru destructure et
  const { t } = useTranslation();
  const { user } = useUser();

  // ❗️ZORUNLU DÜZELTME-2: useCsrfToken içinden string token’ı al
  const { csrfToken } = useCsrfToken();

  const [products, setProducts] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    image_url: "",
    price: "",
    commissionRate: "",
    merchant_url: "",
    max_sales_limit: "",
  });
  const [message, setMessage] = useState("");
  const [minCommission, setMinCommission] = useState(5);
  const [showCode, setShowCode] = useState({});
  const [copyMsg, setCopyMsg] = useState({});
  const [editingProductId, setEditingProductId] = useState(null);
  const [editValues, setEditValues] = useState({ commissionRate: "", max_sales_limit: "" });
  const [loading, setLoading] = useState(false);

  // PRODUCTS FETCH
  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/merchant_dashboard", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        setMinCommission(data.minCommission || 5);
      } else setProducts([]);
    } catch {
      setProducts([]);
    }
  };
  useEffect(() => { fetchProducts(); }, []);

  // FORM HANDLERS
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/merchant_dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",   // ✅ string gönder
          accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFormVisible(false);
        setForm({ name: "", description: "", image_url: "", price: "", commissionRate: "", merchant_url: "", max_sales_limit: "" });
        fetchProducts();
        setMessage(t("productReviewMsg"));
        setTimeout(() => setMessage(""), 4000);
      } else {
        setMessage(`❌ ${data.error || t("failedAddProduct")}`);
      }
    } catch {
      setMessage("❌ " + t("serverError"));
    }
    setLoading(false);
  };

  const handleDeactivate = async (productId, action) => {
    setLoading(true);
    try {
      const res = await fetch("/api/merchant_dashboard", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",  // ✅ string gönder
          accept: "application/json",
        },
        body: JSON.stringify({ productId, action }),
      });
      if (res.ok) fetchProducts();
      else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || t("failedProductUpdate"));
      }
    } catch {
      alert(t("serverError"));
    }
    setLoading(false);
  };

  const remainingQuota = (limit, sold) => Math.max(0, Number(limit) - Number(sold));
  const toggleShowCode = (productId) => setShowCode((prev) => ({ ...prev, [productId]: !prev[productId] }));
  const copyProductCode = async (productId, code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyMsg((prev) => ({ ...prev, [productId]: t("copied") }));
      setTimeout(() => setCopyMsg((prev) => ({ ...prev, [productId]: "" })), 1200);
    } catch {
      alert(t("failedCopy"));
    }
  };

  const startEditing = (product) => {
    setEditingProductId(product.productId);
    setEditValues({
      commissionRate: product.commissionRate,
      max_sales_limit: product.max_sales_limit,
    });
  };
  const handleEditChange = (field, value) => setEditValues((prev) => ({ ...prev, [field]: value }));
  const saveEdits = async () => {
    if (Number(editValues.commissionRate) < minCommission) {
      alert(t("minCommissionWarn").replace("{minCommission}", minCommission));
      return;
    }
    if (!Number.isInteger(Number(editValues.max_sales_limit)) || Number(editValues.max_sales_limit) < 0) {
      alert(t("maxSalesLimitWarn"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/merchant_dashboard", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",  // ✅ string gönder
          accept: "application/json",
        },
        body: JSON.stringify({
          productId: editingProductId,
          commissionRate: Number(editValues.commissionRate),
          max_sales_limit: Number(editValues.max_sales_limit),
        }),
      });
      if (res.ok) {
        setEditingProductId(null);
        fetchProducts();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || t("failedProductUpdate"));
      }
    } catch {
      alert(t("serverError"));
    }
    setLoading(false);
  };
  const cancelEdits = () => {
    setEditingProductId(null);
    setEditValues({ commissionRate: "", max_sales_limit: "" });
  };

  const inputClass =
    "bg-[#161819] text-[#e6ffe6] border border-[#252b24] rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-[#81d742] transition placeholder:text-[#3b4a36]";

  return (
    <MerchantLayout>
      <section className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-[#d1ffd0]">{t("manageProducts")}</h1>
        <button
          onClick={() => setFormVisible((v) => !v)}
          className="flex items-center gap-2 bg-[#81d742] text-[#101010] px-5 py-2 rounded hover:bg-[#aaff6c] transition font-semibold text-base shadow"
        >
          <PlusCircle size={19} /> {t("addNewProduct")}
        </button>
      </section>

      {message && (
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-white bg-[#222624] border border-[#303d33] px-4 py-3 rounded-md shadow"
             aria-live="polite">
          <CheckCircle size={18} className="text-green-400" /> {message}
        </div>
      )}

      {/* --- ADD PRODUCT FORM --- */}
      {formVisible && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#191c1b] border border-[#272e29] p-6 rounded-2xl mb-10 space-y-4 shadow-2xl max-w-2xl mx-auto"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" className={inputClass} placeholder={t("productTitle")} required onChange={e => setForm({ ...form, name: e.target.value })} />
            <input type="text" className={inputClass} placeholder={t("productUrl")} required onChange={e => setForm({ ...form, merchant_url: e.target.value })} />
            <input type="text" className={inputClass} placeholder={t("productImage")} required onChange={e => setForm({ ...form, image_url: e.target.value })} />
            <input type="number" inputMode="decimal" className={inputClass} placeholder={t("productPrice")} required step="0.01" onChange={e => setForm({ ...form, price: e.target.value })} />
            <input type="number" inputMode="decimal" className={inputClass} placeholder={t("commissionRate")} required step="0.1" min={minCommission} onChange={e => setForm({ ...form, commissionRate: e.target.value })} />
            <input type="number" inputMode="numeric" className={inputClass} placeholder={t("maxSalesLimit")} required onChange={e => setForm({ ...form, max_sales_limit: e.target.value })} />
          </div>
          <textarea className={inputClass + " w-full"} placeholder={t("productDesc")} rows={3} onChange={e => setForm({ ...form, description: e.target.value })}></textarea>
          <p className="text-xs text-gray-500 font-mono -mt-2">{t("formHintCommission")}</p>
          <button type="submit" disabled={loading} className="bg-[#262f24] text-[#d1ffd0] font-semibold py-2 px-6 rounded hover:bg-[#293f21] mt-3 transition">
            {loading ? t("adding") : t("submitReview")}
          </button>
        </form>
      )}

      {/* --- PRODUCT CARDS --- */}
      <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => {
          const status = getQuotastatus(p);
          return (
            <div
              key={p.productId}
              className={`relative bg-[#181818] border border-[#232323] rounded-2xl p-7 flex flex-col shadow-lg hover:shadow-2xl transition-all duration-300 min-h-[490px] max-w-lg mx-auto group
                ${status ? "opacity-60 grayscale" : ""}`}
            >
              {/* status BADGES */}
              {status === "inactive" && (
                <span className="absolute left-5 top-5 bg-red-700/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                  <Ban size={13} /> {t("inactive")}
                </span>
              )}
              {status === "quota" && (
                <span className="absolute left-5 top-5 bg-yellow-600/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <Ban size={13} /> {t("quotaReached")}
                </span>
              )}
              {/* Product IMAGE */}
              <img
                src={p.image_url || PLACEHOLDER}
                onError={handleImgError}
                alt={p.name}
                className="rounded-xl mb-4 h-44 w-full object-cover border border-[#202720]"
                style={{ background: "#23262a" }}
                loading="lazy"
                decoding="async"
              />
              <h3 className="text-2xl font-extrabold text-[#d1ffd0] mb-1 truncate">{p.name}</h3>
              <p className="text-sm text-gray-400 mb-3 line-clamp-2">{p.description}</p>
              <div className="flex flex-wrap justify-between text-base mb-2 text-gray-200 font-mono gap-y-1">
                <span>
                  <span className="text-gray-500">{t("price")}</span>: <span className="font-bold">${Number(p.price).toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-gray-500">{t("commission")}</span>: <span className="font-bold text-green-300">{Number(p.commissionRate).toFixed(2)}%</span>
                </span>
              </div>
              <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                <span>{t("clicks")}: <b>{p.totalClicks}</b></span>
                <span>{t("sales")}: <b>{p.total_purchases}</b></span>
                <span>{t("quotaLeft")}: <b>{remainingQuota(p.max_sales_limit, p.total_purchases)}</b></span>
              </div>
              <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                <span>{t("affiliates")}: <b>{p.link_count}</b></span>
                <span>Product ID: {p.productId}</span>
              </div>
              {/* Product Code */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">{t("productCode")}:</span>
                {showCode[p.productId] ? (
                  <>
                    <span className="font-mono text-green-300 text-xs select-all">{p.productCode}</span>
                    <button
                      type="button"
                      onClick={() => copyProductCode(p.productId, p.productCode)}
                      className="ml-1 text-[#81d742] hover:text-green-200 transition"
                      title={t("copyCode")}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleShowCode(p.productId)}
                      className="text-gray-400 hover:text-gray-200 transition"
                      title={t("hide")}
                    >
                      <EyeOff size={15} />
                    </button>
                    {copyMsg[p.productId] && <span className="ml-2 text-green-400 font-mono text-xs">{copyMsg[p.productId]}</span>}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleShowCode(p.productId)}
                    className="flex items-center gap-1 text-gray-400 hover:text-[#81d742] font-mono text-xs bg-[#161616] rounded px-2 py-1 ml-1"
                    title={t("showCode")}
                  >
                    <Eye size={14} /> {t("show")}
                  </button>
                )}
              </div>
              <div className={`mt-4 text-xs font-semibold ${p.activated_by_admin ? "text-green-500" : "text-yellow-400"}`}>
                {p.activated_by_admin ? t("approvedByAdmin") : t("waitingApproval")}
              </div>
              {/* Edit & Activate/Deactivate */}
              <div className="flex flex-col gap-2 mt-auto pt-4">
                {editingProductId === p.productId ? (
                  <div className="flex flex-col gap-2">
                    <div className="mb-3 bg-yellow-900/70 border border-yellow-600 text-yellow-100 px-3 py-2 rounded text-xs font-mono font-bold">
                      ⚠️ {t("adminApprovalWarn")}
                    </div>
                    <div className="flex gap-3 items-center">
                      <label className="text-xs text-[#d1ffd0] font-mono mr-1 w-24">{t("commissionShort")}</label>
                      <input
                        type="number"
                        step="0.1"
                        min={minCommission}
                        max={99}
                        value={editValues.commissionRate}
                        onChange={e => handleEditChange("commissionRate", e.target.value)}
                        className={inputClass + " w-24 text-green-300"}
                        placeholder={t("commissionShort")}
                        inputMode="decimal"
                      />
                      <span className="ml-2 text-xs text-gray-400">(min: {minCommission})</span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <label className="text-xs text-[#d1ffd0] font-mono mr-1 w-24">{t("maxSales")}</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={editValues.max_sales_limit}
                        onChange={e => handleEditChange("max_sales_limit", e.target.value)}
                        className={inputClass + " w-28 text-blue-300"}
                        placeholder={t("maxSales")}
                        inputMode="numeric"
                      />
                      <span className="ml-2 text-xs text-gray-400">({t("sold")}: {p.total_purchases})</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={saveEdits} disabled={loading} className="bg-[#81d742] px-3 py-1 rounded font-semibold text-[#0b0b0b] hover:bg-[#aaff6c] text-xs">
                        {t("save")}
                      </button>
                      <button onClick={cancelEdits} disabled={loading} className="bg-[#a94a4a] px-3 py-1 rounded font-semibold hover:bg-[#ff6a6a] text-xs">
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditing(p)}
                      className="bg-[#262f24] hover:bg-[#273427] text-[#d1ffd0] py-2 rounded text-sm flex-1 transition"
                    >
                      {t("edit")}
                    </button>
                    <button
                      onClick={() => handleDeactivate(p.productId, p.isActive ? "deactivate" : "activate")}
                      className={`${p.isActive ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"} text-white py-2 rounded text-sm flex-1`}
                    >
                      {p.isActive ? t("deactivate") : t("activate")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </MerchantLayout>
  );
}
