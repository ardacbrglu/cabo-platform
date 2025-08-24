"use client";

/**
 * Merchant Dashboard — add/edit/deactivate products with secure mutations
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { PlusCircle, CheckCircle, Eye, EyeOff, Copy, Ban, XCircle } from "lucide-react";
import MerchantLayout from "@/components/merchant/MerchantLayout";
import { apiFetch } from "@/lib/apiFetch";

const PLACEHOLDER = "https://placehold.co/128x128?text=Product";

function handleImgError(e) {
  e.target.onerror = null;
  e.target.src = PLACEHOLDER;
}
function getQuotaStatus(product) {
  if (!product.isActive) return "inactive";
  if (product.total_purchases >= product.max_sales_limit) return "quota";
  return null;
}
function isHttpUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function MerchantDashboardPage() {
  const router = useRouter();
  const { user, ready } = useUser();

  const t = useTranslation();
  const locale = t.locale || "en";

  useEffect(() => {
    if (!ready) return;
    if (user?.role && user.role !== "merchant") router.replace("/unauthorized");
  }, [ready, user?.role, router]);

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
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [minCommission, setMinCommission] = useState(5); // API’den geliyor
  const [showCode, setShowCode] = useState({});
  const [copyMsg, setCopyMsg] = useState({});
  const [editingProductId, setEditingProductId] = useState(null);
  const [editValues, setEditValues] = useState({ commissionRate: "", max_sales_limit: "" });
  const [loading, setLoading] = useState(false);

  const [notice, setNotice] = useState({ type: null, text: "" });
  const closeNoticeSoon = () => setTimeout(() => setNotice({ type: null, text: "" }), 3500);

  const inflight = useRef(false);
  const abortRef = useRef(null);

  // ---- Validators ----
  const validateCreate = useMemo(
    () => (data) => {
      const e = {};
      if (!data.name.trim()) e.name = t("validation_required");
      if (!isHttpUrl(data.merchant_url)) e.merchant_url = t("validation_url");
      if (!isHttpUrl(data.image_url)) e.image_url = t("validation_imageUrlHttp");

      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) e.price = t("validation_price");

      const cr = Number(data.commissionRate);
      if (!Number.isFinite(cr) || cr < minCommission || cr > 99.9) {
        e.commissionRate = t("validation_commission", { min: minCommission });
      }

      const rawMax = String(data.max_sales_limit ?? "").trim();
      const maxL = Math.floor(Number(rawMax));
      if (!rawMax || !Number.isInteger(maxL) || maxL < 1) e.max_sales_limit = t("validation_maxLimit");

      return e;
    },
    [minCommission, t]
  );

  const validateEdit = (vals, sold) => {
    const e = {};
    if (
      vals.commissionRate !== "" &&
      (!Number.isFinite(Number(vals.commissionRate)) ||
        Number(vals.commissionRate) < minCommission ||
        Number(vals.commissionRate) > 99.9)
    ) {
      e.commissionRate = t("validation_commission", { min: minCommission });
    }
    if (vals.max_sales_limit !== "") {
      const v = Math.floor(Number(vals.max_sales_limit));
      if (!Number.isInteger(v) || v < 1 || v < Number(sold)) e.max_sales_limit = t("validation_maxLimitEdit");
    }
    return e;
  };

  // ---- PRODUCTS FETCH ----
  const fetchProducts = async () => {
    if (inflight.current) return;
    inflight.current = true;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let res = await apiFetch("/api/merchant_dashboard", {
        method: "GET",
        signal: controller.signal,
        headers: { "accept-language": locale },
      });

      if (res.status === 429) {
        const retryAfter = Math.min(Number(res.headers?.get?.("Retry-After")) || 15, 60);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        res = await apiFetch("/api/merchant_dashboard", {
          method: "GET",
          signal: controller.signal,
          headers: { "accept-language": locale },
        });
      }

      if (res.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      if (res.status === 403) {
        router.replace("/unauthorized");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setProducts(data.products || []);
        setMinCommission(typeof data.minCommission === "number" ? data.minCommission : 5);
      } else {
        setProducts([]);
        setNotice({ type: "error", text: t("serverError") });
        closeNoticeSoon();
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setProducts([]);
        setNotice({ type: "error", text: t("serverError") });
        closeNoticeSoon();
      }
    } finally {
      inflight.current = false;
    }
  };

  useEffect(() => {
    fetchProducts();
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // ---- SUBMIT ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);

    const errs = validateCreate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setNotice({ type: null, text: "" });
    try {
      let res = await apiFetch("/api/merchant_dashboard", {
        method: "POST",
        headers: { "accept-language": locale },
        body: form,
      });

      if (res.status === 429) {
        const retryAfter = Math.min(Number(res.headers?.get?.("Retry-After")) || 15, 60);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        res = await apiFetch("/api/merchant_dashboard", {
          method: "POST",
          headers: { "accept-language": locale },
          body: form,
        });
      }

      if (res.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      if (res.status === 403) {
        setNotice({ type: "error", text: t("forbidden") });
        closeNoticeSoon();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setFormVisible(false);
        setSubmitted(false);
        setErrors({});
        setForm({
          name: "",
          description: "",
          image_url: "",
          price: "",
          commissionRate: "",
          merchant_url: "",
          max_sales_limit: "",
        });
        await fetchProducts();
        setNotice({ type: "success", text: t("productReviewMsg") });
        closeNoticeSoon();
      } else {
        setNotice({ type: "error", text: t("failedAddProduct") });
        closeNoticeSoon();
      }
    } catch {
      setNotice({ type: "error", text: t("serverError") });
      closeNoticeSoon();
    } finally {
      setLoading(false);
    }
  };

  // ---- PATCH ----
  const mutate = async (payload) => {
    try {
      let res = await apiFetch("/api/merchant_dashboard", {
        method: "PATCH",
        headers: { "accept-language": locale },
        body: payload,
      });

      if (res.status === 429) {
        const retryAfter = Math.min(Number(res.headers?.get?.("Retry-After")) || 15, 60);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        res = await apiFetch("/api/merchant_dashboard", {
          method: "PATCH",
          headers: { "accept-language": locale },
          body: payload,
        });
      }

      if (res.status === 401) {
        router.replace("/merchant/login");
        return { ok: false };
      }
      if (res.status === 403) {
        setNotice({ type: "error", text: t("forbidden") });
        closeNoticeSoon();
        return { ok: false };
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: "error", text: t("serverError") });
        closeNoticeSoon();
        return { ok: false };
      }
      return { ok: true, data };
    } catch {
      setNotice({ type: "error", text: t("serverError") });
      closeNoticeSoon();
      return { ok: false };
    }
  };

  const handleToggleActive = async (productId, action) => {
    setLoading(true);
    const res = await mutate({ productId, action });
    if (res.ok) await fetchProducts();
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
      setNotice({ type: "error", text: t("failedCopy") });
      closeNoticeSoon();
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

  const saveEdits = async (product) => {
    const errs = validateEdit(editValues, product.total_purchases);
    if (Object.keys(errs).length) {
      setNotice({ type: "error", text: Object.values(errs)[0] || t("serverError") });
      closeNoticeSoon();
      return;
    }
    setLoading(true);
    const res = await mutate({
      productId: editingProductId,
      commissionRate:
        editValues.commissionRate === "" ? undefined : Number(editValues.commissionRate),
      max_sales_limit:
        editValues.max_sales_limit === "" ? undefined : Number(editValues.max_sales_limit),
    });
    if (res.ok) {
      setEditingProductId(null);
      setEditValues({ commissionRate: "", max_sales_limit: "" });
      await fetchProducts();
    }
    setLoading(false);
  };
  const cancelEdits = () => {
    setEditingProductId(null);
    setEditValues({ commissionRate: "", max_sales_limit: "" });
  };

  const inputBase =
    "bg-[#161819] text-[#e6ffe6] border border-[#252b24] rounded px-3 py-2 w-full focus:outline-none focus:ring-2 transition placeholder:text-[#3b4a36]";
  const ringErr = "focus:ring-red-400 border-red-500";
  const ringOk = "focus:ring-[#81d742]";

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

      {notice.text ? (
        <div
          className={`mb-6 flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-md shadow border ${
            notice.type === "error"
              ? "text-white bg-[#2a1f1f] border-[#3a2a2a]"
              : "text-white bg-[#222624] border-[#303d33]"
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.type === "error" ? (
            <XCircle size={18} className="text-red-400" />
          ) : (
            <CheckCircle size={18} className="text-green-400" />
          )}
          {notice.text}
        </div>
      ) : null}

      {/* --- ADD PRODUCT FORM --- */}
      {formVisible && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-[#191c1b] border border-[#272e29] p-6 rounded-2xl mb-10 space-y-4 shadow-2xl max-w-2xl mx-auto"
        >
          {/* top info bar: minimum commission */}
          <div className="text-xs font-mono text-[#c8f7c8] bg-[#1b2519] border border-[#2b3b2a] rounded px-3 py-2 mb-2">
            {t("formHintCommission")} — <b>{t("minLabel")} {minCommission}%</b>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* name */}
            <div>
              <input
                type="text"
                className={`${inputBase} ${submitted && errors.name ? ringErr : ringOk}`}
                placeholder={t("productTitle")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-invalid={submitted && !!errors.name}
                required
                autoComplete="off"
              />
              {submitted && errors.name && (
                <p className="mt-1 text-xs text-red-400">{errors.name}</p>
              )}
            </div>

            {/* product url */}
            <div>
              <input
                type="url"
                className={`${inputBase} ${submitted && errors.merchant_url ? ringErr : ringOk}`}
                placeholder={t("productUrl")}
                value={form.merchant_url}
                onChange={(e) => setForm({ ...form, merchant_url: e.target.value })}
                aria-invalid={submitted && !!errors.merchant_url}
                required
                autoComplete="off"
              />
              {submitted && errors.merchant_url && (
                <p className="mt-1 text-xs text-red-400">{errors.merchant_url}</p>
              )}
            </div>

            {/* image url */}
            <div className="md:col-span-2">
              <input
                type="url"
                className={`${inputBase} ${submitted && errors.image_url ? ringErr : ringOk}`}
                placeholder={t("productImage")}
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                aria-invalid={submitted && !!errors.image_url}
                required
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                {t("imageHint")} {/* Only https:// links; base64 data: URLs are not allowed */}
              </p>
              {submitted && errors.image_url && (
                <p className="mt-1 text-xs text-red-400">{errors.image_url}</p>
              )}
            </div>

            {/* price */}
            <div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={`${inputBase} ${submitted && errors.price ? ringErr : ringOk}`}
                placeholder={t("productPrice")}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                aria-invalid={submitted && !!errors.price}
                required
                autoComplete="off"
              />
              {submitted && errors.price && (
                <p className="mt-1 text-xs text-red-400">{errors.price}</p>
              )}
            </div>

            {/* commission */}
            <div>
              <input
                type="number"
                step="0.1"
                min={minCommission}
                max={99.9}
                className={`${inputBase} ${submitted && errors.commissionRate ? ringErr : ringOk}`}
                placeholder={t("commissionRate")}
                value={form.commissionRate}
                onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                aria-invalid={submitted && !!errors.commissionRate}
                required
                autoComplete="off"
              />
              <div className="mt-1 text-[11px] text-gray-400">
                {t("minLabel")} {minCommission}% — {t("commissionTip")}
              </div>
              {submitted && errors.commissionRate && (
                <p className="mt-1 text-xs text-red-400">{errors.commissionRate}</p>
              )}
            </div>

            {/* max sales limit */}
            <div>
              <input
                type="number"
                min={1}
                step={1}
                className={`${inputBase} ${submitted && errors.max_sales_limit ? ringErr : ringOk}`}
                placeholder={t("maxSalesLimit")}
                value={form.max_sales_limit}
                onChange={(e) => setForm({ ...form, max_sales_limit: e.target.value })}
                aria-invalid={submitted && !!errors.max_sales_limit}
                required
                autoComplete="off"
              />
              {submitted && errors.max_sales_limit && (
                <p className="mt-1 text-xs text-red-400">{errors.max_sales_limit}</p>
              )}
            </div>
          </div>

          <textarea
            className={`${inputBase} w-full ${ringOk}`}
            placeholder={t("productDesc")}
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-[#262f24] text-[#d1ffd0] font-semibold py-2 px-6 rounded hover:bg-[#293f21] mt-3 transition disabled:opacity-60"
          >
            {loading ? t("adding") : t("submitReview")}
          </button>
        </form>
      )}

      {/* --- PRODUCT CARDS --- */}
      {/* (kartlar aynı; sadece küçük metin iyileştirmeleri) */}
      <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => {
          const status = getQuotaStatus(p);
          return (
            <div
              key={p.productId}
              className={`relative bg-[#181818] border border-[#232323] rounded-2xl p-7 flex flex-col shadow-lg hover:shadow-2xl transition-all duration-300 min-h[490px] max-w-lg mx-auto group ${
                status ? "opacity-60 grayscale" : ""
              }`}
            >
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

              <img
                src={p.image_url || PLACEHOLDER}
                onError={handleImgError}
                alt={p.name}
                className="rounded-xl mb-4 h-44 w-full object-cover border border-[#202720]"
                style={{ background: "#23262a" }}
              />

              <h3 className="text-2xl font-extrabold text-[#d1ffd0] mb-1 truncate">{p.name}</h3>
              <p className="text-sm text-gray-400 mb-3 line-clamp-2">{p.description}</p>

              <div className="flex flex-wrap justify-between text-base mb-2 text-gray-200 font-mono gap-y-1">
                <span>
                  <span className="text-gray-500">{t("price")}</span>:{" "}
                  <span className="font-bold">${Number(p.price).toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-gray-500">{t("commission")}</span>:{" "}
                  <span className="font-bold text-green-300">
                    {Number(p.commissionRate).toFixed(2)}%
                  </span>
                </span>
              </div>

              <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                <span>
                  {t("clicks")}: <b>{p.totalClicks}</b>
                </span>
                <span>
                  {t("sales")}: <b>{p.total_purchases}</b>
                </span>
                <span>
                  {t("quotaLeft")}: <b>{Math.max(0, Number(p.max_sales_limit) - Number(p.total_purchases))}</b>
                </span>
              </div>

              <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                <span>
                  {t("affiliates")}: <b>{p.link_count}</b>
                </span>
                <span>Product ID: {p.productId}</span>
              </div>

              {/* code show/copy … (değişmedi) */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">{t("productCode")}:</span>
                {showCode[p.productId] ? (
                  <>
                    <span className="font-mono text-green-300 text-xs select-all">
                      {p.productCode}
                    </span>
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
                    {copyMsg[p.productId] && (
                      <span className="ml-2 text-green-400 font-mono text-xs">
                        {copyMsg[p.productId]}
                      </span>
                    )}
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

              <div
                className={`mt-4 text-xs font-semibold ${
                  p.activated_by_admin ? "text-green-500" : "text-yellow-400"
                }`}
              >
                {p.activated_by_admin ? t("approvedByAdmin") : t("waitingApproval")}
              </div>

              <div className="flex flex-col gap-2 mt-auto pt-4">
                {editingProductId === p.productId ? (
                  <div className="flex flex-col gap-2">
                    <div className="mb-3 bg-yellow-900/70 border border-yellow-600 text-yellow-100 px-3 py-2 rounded text-xs font-mono font-bold">
                      ⚠️ {t("adminApprovalWarn")}
                    </div>
                    <div className="flex gap-3 items-center">
                      <label className="text-xs text-[#d1ffd0] font-mono mr-1 w-24">
                        {t("commissionShort")}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={minCommission}
                        max={99}
                        value={editValues.commissionRate}
                        onChange={(e) => handleEditChange("commissionRate", e.target.value)}
                        className={`${inputBase} w-24 ${ringOk} ${
                          editValues.commissionRate !== "" &&
                          Number(editValues.commissionRate) < minCommission
                            ? ringErr
                            : ""
                        } text-green-300`}
                        placeholder={t("commissionShort")}
                      />
                      <span className="ml-2 text-xs text-gray-400">
                        (min: {minCommission}%)
                      </span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <label className="text-xs text-[#d1ffd0] font-mono mr-1 w-24">
                        {t("maxSales")}
                      </label>
                      <input
                        type="number"
                        min={Math.max(1, Number(p.total_purchases))}
                        step={1}
                        value={editValues.max_sales_limit}
                        onChange={(e) => handleEditChange("max_sales_limit", e.target.value)}
                        className={`${inputBase} w-28 ${ringOk} text-blue-300`}
                        placeholder={t("maxSales")}
                      />
                      <span className="ml-2 text-xs text-gray-400">
                        ({t("sold")}: {p.total_purchases})
                      </span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => saveEdits(p)}
                        disabled={loading}
                        className="bg-[#81d742] px-3 py-1 rounded font-semibold text-[#0b0b0b] hover:bg-[#aaff6c] text-xs"
                      >
                        {t("save")}
                      </button>
                      <button
                        onClick={cancelEdits}
                        disabled={loading}
                        className="bg-[#a94a4a] px-3 py-1 rounded font-semibold hover:bg-[#ff6a6a] text-xs"
                      >
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
                      onClick={() =>
                        handleToggleActive(p.productId, p.isActive ? "deactivate" : "activate")
                      }
                      className={`${
                        p.isActive ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"
                      } text-white py-2 rounded text-sm flex-1`}
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

export const runtime = "nodejs";
