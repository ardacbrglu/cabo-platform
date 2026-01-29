"use client";

/**
 * Merchant Dashboard — Manage Products (UI fix: responsive edit modal)
 *
 * Security:
 * - requireSession + requireRole('merchant') (UserContext / guards)
 * - All requests via apiFetch (credentials:include, X-Requested-With, X-Request-Id)
 * - GET 60/min, POST/PATCH 10/min (server enforces)
 * - Optional NextAuth CSRF; server validates Origin/Referer + AJAX + CSRF when present
 *
 * UX:
 * - Locales: uses central keys via useTranslation()
 * - A11y: aria-live notices, focus management, disabled states
 * - Mobile friendly cards & **modal with sticky header/footer & scrollable body**
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  PlusCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Copy,
  Ban,
  XCircle,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";

const MerchantLayout = dynamic(() => import("@/components/merchant/MerchantLayout"), {
  ssr: false,
});

const PLACEHOLDER = "https://placehold.co/128x128?text=Product";

// Ensure that only safe image URLs are used in DOM attributes.
// Allows only absolute HTTPS URLs; otherwise returns null so callers can fall back to a safe default.
function sanitizeImageUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS image URLs. This rejects javascript:, data:, and other potentially dangerous schemes.
    if (parsed.protocol !== "https:") {
      return null;
    }

    // Optionally, you could further restrict to specific trusted hosts here.
    // Example:
    // const allowedHosts = new Set(["images.example.com"]);
    // if (!allowedHosts.has(parsed.hostname)) return null;

    return parsed.toString();
  } catch {
    // Invalid URL; treat as unsafe.
    return null;
  }
}

/* ------- helpers ------- */
function handleImgError(e) {
  e.target.onerror = null;
  e.target.src = PLACEHOLDER;
}
function getQuotaStatus(p) {
  if (!p.isActive) return "inactive";
  if (Number(p.total_purchases) >= Number(p.max_sales_limit)) return "quota";
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
function isDataImage(v, maxBytes = 2 * 1024 * 1024) {
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(v || "")) return false;
  const b64 = (v.split(",")[1] || "");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const size = Math.floor((b64.length * 3) / 4) - pad;
  return size > 0 && size <= maxBytes;
}
function isAcceptedImageUrl(v) {
  if (!v) return false;
  if (v.startsWith("data:image/")) return isDataImage(v);
  return isHttpUrl(v);
}

export default function MerchantDashboardPage() {
  const router = useRouter();
  const { user, ready } = useUser();
  const t = useTranslation();
  const locale = t.locale || "en";

  const tt = (key, params) => {
    const raw = t(key) || key;
    return raw.replace(/\{(\w+)\}/g, (_, k) => (params && params[k] != null ? String(params[k]) : `{${k}}`));
  };

  useEffect(() => {
    if (!ready) return;
    if (user?.role && user.role !== "merchant") router.replace("/unauthorized");
  }, [ready, user?.role, router]);

  // CSRF preload (mutations)
  const [csrfToken, setCsrfToken] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (j?.csrfToken) setCsrfToken(j.csrfToken);
      } catch {}
    })();
  }, []);

  const [products, setProducts] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [minCommission, setMinCommission] = useState(5);
  const [notice, setNotice] = useState({ type: null, text: "" });

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
  const [loading, setLoading] = useState(false);

  const [showCode, setShowCode] = useState({});
  const [copyMsg, setCopyMsg] = useState({});

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editOriginal, setEditOriginal] = useState(null);
  const [edit, setEdit] = useState({
    name: "",
    description: "",
    image_url: "",
    merchant_url: "",
    price: "",
    commissionRate: "",
    max_sales_limit: "",
  });
  const [editSubmitted, setEditSubmitted] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  const inflight = useRef(false);
  const abortRef = useRef(null);
  const closeNoticeSoon = () =>
    setTimeout(() => setNotice({ type: null, text: "" }), 3500);

  const inputBase =
    "bg-[#161819] text-[#e6ffe6] border border-[#252b24] rounded px-3 py-2 w-full focus:outline-none focus:ring-2 transition placeholder:text-[#3b4a36]";
  const ringErr = "focus:ring-red-400 border-red-500";
  const ringOk = "focus:ring-[#81d742]";

  const tx = useMemo(
    () => ({
      loading: t("productLoading") || t("loading") || "Loading...",
      refresh: t("postlogs.refresh") || "Refresh",
      manageProducts: t("manageProducts") || "Manage Products",
      addNewProduct: t("addNewProduct") || "Add New Product",
      serverError: t("serverError") || "Server error. Please try again later.",
      forbidden: t("forbidden") || "You don't have permission to perform this action.",
      productReviewMsg: t("productReviewMsg") || "Your product is sent for review.",
      failedAddProduct: t("failedAddProduct") || "Failed to add product.",
      adding: t("adding") || "Adding...",
      submitReview: t("submitReview") || "Submit for Review",
      productTitle: t("productTitle") || "Title",
      productUrl: t("productUrl") || "Product URL",
      productImage: t("productImage") || "Image URL",
      productDesc: t("productDesc") || "Description",
      price: t("price") || "Price",
      commissionRate: t("commissionRate") || "Commission Rate (%)",
      maxSalesLimit: t("maxSalesLimit") || "Max Sales Limit",
      clicks: t("clicks") || "Clicks",
      sales: t("sales") || "Sales",
      quotaLeft: t("quotaLeft") || "Quota Left",
      affiliates: t("affiliates") || "Affiliates",
      inactive: t("inactive") || "Inactive",
      quotaReached: t("quotaReached") || "Quota Reached",
      show: t("show") || "Show",
      hide: t("hide") || "Hide",
      copyCode: t("copyCode") || "Copy Product Code",
      copied: t("copied") || "Copied!",
      approvedByAdmin: t("approvedByAdmin") || "Approved by Admin",
      waitingApproval: t("waitingApproval") || "Waiting Approval",
      edit: t("edit") || "Edit",
      deactivate: t("deactivate") || "Deactivate",
      activate: t("activate") || "Activate",
      save: t("save") || "Save",
      cancel: t("cancel") || "Cancel",
      minLabel: t("minLabel") || "min",
      productPrice: t("productPrice") || "Price",
      imageHint: t("imageHint") || "HTTPS image URL or data:image/*;base64,… (≤ 2 MB) is accepted.",
      adminApprovalWarn:
        t("adminApprovalWarn") ||
        "Any changes made will require admin approval before your product becomes available again.",
      saved: t("saved") || "Saved!",
      failedCopy: t("failedCopy") || "Failed to copy product code.",
      // validation
      v_required: t("validation_required") || "This field is required.",
      v_url: t("validation_url") || "Enter a valid HTTPS URL.",
      v_imageUrl: t("validation_imageUrl") || "Provide a valid HTTPS image URL or data:image/*;base64,…",
      v_price: t("validation_price") || "Enter a valid price greater than 0.",
      v_commission: t("validation_commission") || "Commission must be between {min}% and 99.9%.",
      v_maxLimit: t("validation_maxLimit") || "Max sales limit must be an integer ≥ 1.",
      v_maxLimitEdit:
        t("validation_maxLimitEdit") || "Max sales limit must be ≥ 1 and cannot be less than the sold count.",
      // tips
      tip_commission: t("formHintCommission") || "Higher commission rates attract more affiliates.",
      close: t("close") || "Close",
    }),
    [t]
  );

  const warn = (msg) => {
    setNotice({ type: "error", text: msg });
    closeNoticeSoon();
  };

  const clampCommission = (val) => {
    let v = Number(val);
    if (!Number.isFinite(v) || v <= 0) {
      v = minCommission;
      warn(tt("validation_commission", { min: minCommission }));
    } else if (v < minCommission) {
      v = minCommission;
      warn(tt("validation_commission", { min: minCommission }));
    } else if (v > 99.9) {
      v = 99.9;
      warn(tt("validation_commission", { min: minCommission }));
    }
    return Number(v.toFixed(1));
  };
  const clampLimit = (val, sold = 0) => {
    let v = Math.floor(Number(val));
    if (!Number.isInteger(v) || v < 1) {
      v = Math.max(1, sold);
      warn(tx.v_maxLimit);
    } else if (v < sold) {
      v = sold;
      warn(tx.v_maxLimitEdit);
    }
    return v;
  };

  const validateCreate = useMemo(
    () => (data) => {
      const e = {};
      if (!String(data.name || "").trim()) e.name = tx.v_required;
      if (!isHttpUrl(data.merchant_url)) e.merchant_url = tx.v_url;
      if (!isAcceptedImageUrl(data.image_url)) e.image_url = tx.v_imageUrl;
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) e.price = tx.v_price;
      const cr = Number(data.commissionRate);
      if (!Number.isFinite(cr) || cr < minCommission || cr > 99.9)
        e.commissionRate = tt("validation_commission", { min: minCommission });
      const raw = String(data.max_sales_limit ?? "").trim();
      const maxL = Math.floor(Number(raw));
      if (!raw || !Number.isInteger(maxL) || maxL < 1) e.max_sales_limit = tx.v_maxLimit;
      return e;
    },
    [minCommission, tx, tt]
  );

  const validateEdit = (vals, sold) => {
    const e = {};
    if (!vals.name?.trim()) e.name = tx.v_required;
    if (!isAcceptedImageUrl(vals.image_url)) e.image_url = tx.v_imageUrl;
    if (!isHttpUrl(vals.merchant_url)) e.merchant_url = tx.v_url;
    const p = Number(vals.price);
    if (!Number.isFinite(p) || p <= 0) e.price = tx.v_price;
    const cr = Number(vals.commissionRate);
    if (!Number.isFinite(cr) || cr < minCommission || cr > 99.9)
      e.commissionRate = tt("validation_commission", { min: minCommission });
    const lim = Math.floor(Number(vals.max_sales_limit));
    if (!Number.isInteger(lim) || lim < 1 || lim < Number(sold))
      e.max_sales_limit = tx.v_maxLimitEdit;
    return e;
  };

  const fetchProducts = async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setLoadingList(true);
      let res = await apiFetch("/api/merchant_dashboard", {
        method: "GET",
        headers: { "accept-language": locale },
      });
      if (res.status === 429) {
        const retryAfter = Math.min(Number(res.headers?.get?.("Retry-After")) || 15, 60);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        res = await apiFetch("/api/merchant_dashboard", {
          method: "GET",
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
        setNotice({ type: "error", text: tx.serverError });
        closeNoticeSoon();
      }
    } catch {
      setProducts([]);
      setNotice({ type: "error", text: tx.serverError });
      closeNoticeSoon();
    } finally {
      inflight.current = false;
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    return () => abortRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setNotice({ type: null, text: "" });

    const next = { ...form };
    next.commissionRate = clampCommission(next.commissionRate);
    next.max_sales_limit = clampLimit(next.max_sales_limit);

    const errs = validateCreate(next);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      let res = await apiFetch("/api/merchant_dashboard", {
        method: "POST",
        headers: { "accept-language": locale, ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
        body: next,
      });
      if (res.status === 429) {
        const retryAfter = Math.min(Number(res.headers?.get?.("Retry-After")) || 15, 60);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        res = await apiFetch("/api/merchant_dashboard", {
          method: "POST",
          headers: { "accept-language": locale, ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
          body: next,
        });
      }
      if (res.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      if (res.status === 403) {
        setNotice({ type: "error", text: tx.forbidden });
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
        setNotice({ type: "success", text: tx.productReviewMsg });
        closeNoticeSoon();
      } else {
        setNotice({ type: "error", text: tx.failedAddProduct });
        closeNoticeSoon();
      }
    } catch {
      setNotice({ type: "error", text: tx.serverError });
      closeNoticeSoon();
    } finally {
      setLoading(false);
    }
  };

  const mutate = async (payload) => {
    try {
      let res = await apiFetch("/api/merchant_dashboard", {
        method: "PATCH",
        headers: { "accept-language": locale, ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
        body: payload,
      });
      if (res.status === 429) {
        const retryAfter = Math.min(Number(res.headers?.get?.("Retry-After")) || 15, 60);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        res = await apiFetch("/api/merchant_dashboard", {
          method: "PATCH",
          headers: { "accept-language": locale, ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
          body: payload,
        });
      }
      if (res.status === 401) {
        router.replace("/merchant/login");
        return { ok: false };
      }
      if (res.status === 403) {
        setNotice({ type: "error", text: tx.forbidden });
        closeNoticeSoon();
        return { ok: false };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: "error", text: tx.serverError });
        closeNoticeSoon();
        return { ok: false };
      }
      return { ok: true, data };
    } catch {
      setNotice({ type: "error", text: tx.serverError });
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

  const toggleShowCode = (id) => setShowCode((p) => ({ ...p, [id]: !p[id] }));
  const copyProductCode = async (id, code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyMsg((p) => ({ ...p, [id]: tx.copied }));
      setTimeout(() => setCopyMsg((p) => ({ ...p, [id]: "" })), 1200);
    } catch {
      setNotice({ type: "error", text: tx.failedCopy });
      closeNoticeSoon();
    }
  };

  const openEdit = (p) => {
    setEditOriginal(p);
    setEdit({
      name: p.name || "",
      description: p.description || "",
      image_url: p.image_url || "",
      merchant_url: p.merchant_url || "",
      price: Number(p.price ?? "") || "",
      commissionRate: Number(p.commissionRate ?? "") || "",
      max_sales_limit: Number(p.max_sales_limit ?? "") || "",
    });
    setEditSubmitted(false);
    setEditErrors({});
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditOriginal(null);
    setEditSubmitted(false);
    setEditErrors({});
  };

  const sensitiveChanged =
    editOriginal
      ? Number(edit.commissionRate) !== Number(editOriginal.commissionRate) ||
        Math.floor(Number(edit.max_sales_limit)) !== Math.floor(Number(editOriginal.max_sales_limit))
      : false;

  // Save edit (diff-based PATCH)
  const saveEdit = async () => {
    if (!editOriginal) return;
    setEditSubmitted(true);

    const normalized = {
      ...edit,
      commissionRate: clampCommission(edit.commissionRate),
      max_sales_limit: clampLimit(edit.max_sales_limit, editOriginal.total_purchases || 0),
    };
    setEdit((s) => ({ ...s, ...normalized }));

    const errs = validateEdit(normalized, editOriginal.total_purchases || 0);
    setEditErrors(errs);
    if (Object.keys(errs).length) return;

    const diff = { productId: editOriginal.productId };
    const addIfChanged = (key, val, origVal) => {
      const a = (typeof val === "string" ? val.trim() : val);
      const b = (typeof origVal === "string" ? origVal.trim() : origVal);
      if (String(a) !== String(b)) diff[key] = a;
    };
    addIfChanged("name", normalized.name, editOriginal.name);
    addIfChanged("description", normalized.description, editOriginal.description);
    addIfChanged("image_url", normalized.image_url, editOriginal.image_url);
    addIfChanged("merchant_url", normalized.merchant_url, editOriginal.merchant_url);
    addIfChanged("price", Number(normalized.price), Number(editOriginal.price));
    addIfChanged("commissionRate", Number(normalized.commissionRate), Number(editOriginal.commissionRate));
    addIfChanged("max_sales_limit", Math.floor(Number(normalized.max_sales_limit)), Math.floor(Number(editOriginal.max_sales_limit)));

    if (Object.keys(diff).length === 1) {
      setNotice({ type: "success", text: tx.saved });
      closeNoticeSoon();
      closeEdit();
      return;
    }

    setLoading(true);
    const res = await mutate(diff);
    setLoading(false);

    if (res.ok) {
      closeEdit();
      await fetchProducts();
      const extra = res.data?.approval_reset ? ` — ${tx.adminApprovalWarn}` : "";
      setNotice({ type: "success", text: `${tx.saved}${extra}` });
      closeNoticeSoon();
    }
  };

  // Close with ESC
  useEffect(() => {
    if (!editOpen) return;
    const onKey = (e) => e.key === "Escape" && closeEdit();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editOpen]);

  return (
    <MerchantLayout>
      <section className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-[#d1ffd0]">{tx.manageProducts}</h1>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchProducts}
            disabled={loadingList}
            className="flex items-center gap-2 bg-[#1c231a] text-[#d1ffd0] px-4 py-2 rounded hover:bg[#22301d] border border-[#2a3b26] transition disabled:opacity-60"
            aria-label={tx.refresh}
            title={tx.refresh}
          >
            {loadingList ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            <span className="text-sm font-semibold">{tx.refresh}</span>
          </button>

          <button
            onClick={() => setFormVisible((v) => !v)}
            className="flex items-center gap-2 bg-[#81d742] text-[#101010] px-5 py-2 rounded hover:bg-[#aaff6c] transition font-semibold text-base shadow"
          >
            <PlusCircle size={19} /> {tx.addNewProduct}
          </button>
        </div>
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

      {/* CREATE FORM */}
      {formVisible && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-[#191c1b] border border-[#272e29] p-6 rounded-2xl mb-10 space-y-4 shadow-2xl max-w-2xl mx-auto"
        >
          <div className="text-xs font-mono text-[#c8f7c8] bg-[#1b2519] border border-[#2b3b2a] rounded px-3 py-2 mb-2">
            {tx.tip_commission} — <b>{tx.minLabel} {minCommission}%</b>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <input
                type="text"
                className={`${inputBase} ${submitted && errors.name ? ringErr : ringOk}`}
                placeholder={tx.productTitle}
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

            <div>
              <input
                type="url"
                className={`${inputBase} ${submitted && errors.merchant_url ? ringErr : ringOk}`}
                placeholder={tx.productUrl}
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

            <div className="md:col-span-2">
              <input
                type="text"
                className={`${inputBase} ${submitted && errors.image_url ? ringErr : ringOk}`}
                placeholder={tx.productImage}
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                aria-invalid={submitted && !!errors.image_url}
                required
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-gray-500">{tx.imageHint}</p>
              {submitted && errors.image_url && (
                <p className="mt-1 text-xs text-red-400">{errors.image_url}</p>
              )}
            </div>

            <div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={`${inputBase} ${submitted && errors.price ? ringErr : ringOk}`}
                placeholder={tx.productPrice}
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

            <div>
              <input
                type="number"
                step="0.1"
                min={minCommission}
                max={99.9}
                className={`${inputBase} ${submitted && errors.commissionRate ? ringErr : ringOk}`}
                placeholder={tx.commissionRate}
                value={form.commissionRate}
                onChange={(e) => setForm((s) => ({ ...s, commissionRate: e.target.value }))}
                onBlur={() =>
                  setForm((s) => ({
                    ...s,
                    commissionRate: clampCommission(s.commissionRate),
                  }))
                }
                aria-invalid={submitted && !!errors.commissionRate}
                required
                autoComplete="off"
              />
              <div className="mt-1 text-[11px] text-gray-400">
                {tx.minLabel} {minCommission}%
              </div>
              {submitted && errors.commissionRate && (
                <p className="mt-1 text-xs text-red-400">{errors.commissionRate}</p>
              )}
            </div>

            <div>
              <input
                type="number"
                min={1}
                step={1}
                className={`${inputBase} ${submitted && errors.max_sales_limit ? ringErr : ringOk}`}
                placeholder={tx.maxSalesLimit}
                value={form.max_sales_limit}
                onChange={(e) => setForm((s) => ({ ...s, max_sales_limit: e.target.value }))}
                onBlur={() =>
                  setForm((s) => ({
                    ...s,
                    max_sales_limit: clampLimit(s.max_sales_limit),
                  }))
                }
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
            placeholder={tx.productDesc}
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-[#262f24] text-[#d1ffd0] font-semibold py-2 px-6 rounded hover:bg-[#293f21] mt-3 transition disabled:opacity-60"
          >
            {loading ? tx.adding : tx.submitReview}
          </button>
        </form>
      )}

      {/* Loading state */}
      {loadingList && products.length === 0 ? (
        <div className="w-full max-w-3xl mx-auto my-12">
          <div className="flex items-center justify-center gap-2 text-gray-300 bg-[#141714] border border-[#242b23] rounded-xl px-4 py-6">
            <Loader2 className="animate-spin" size={18} />
            <span className="font-medium">{tx.loading}</span>
          </div>
        </div>
      ) : null}

      {/* CARDS */}
      <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => {
          const status = getQuotaStatus(p);
          return (
            <div
              key={p.productId}
              className={`relative bg-[#181818] border border-[#232323] rounded-2xl p-7 flex flex-col shadow-lg hover:shadow-2xl transition-all duration-300 max-w-lg mx-auto group ${status ? "opacity-60 grayscale" : ""}`}
            >
              {status === "inactive" && (
                <span className="absolute left-5 top-5 bg-red-700/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                  <Ban size={13} /> {tx.inactive}
                </span>
              )}
              {status === "quota" && (
                <span className="absolute left-5 top-5 bg-yellow-600/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                  <Ban size={13} /> {tx.quotaReached}
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
                  <span className="text-gray-500">{tx.price}</span>:{" "}
                  <span className="font-bold">${Number(p.price).toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-gray-500">{t("commission") || "Commission"}</span>:{" "}
                  <span className="font-bold text-green-300">
                    {Number(p.commissionRate).toFixed(2)}%
                  </span>
                </span>
              </div>

              <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                <span>{tx.clicks}: <b>{p.totalClicks}</b></span>
                <span>{tx.sales}: <b>{p.total_purchases}</b></span>
                <span>
                  {tx.quotaLeft}:{" "}
                  <b>{Math.max(0, Number(p.max_sales_limit) - Number(p.total_purchases))}</b>
                </span>
              </div>

              <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                <span>{tx.affiliates}: <b>{p.link_count}</b></span>
                <span>Product ID: {p.productId}</span>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">Code:</span>
                {showCode[p.productId] ? (
                  <>
                    <span className="font-mono text-green-300 text-xs select-all">{p.productCode}</span>
                    <button
                      type="button"
                      onClick={() => copyProductCode(p.productId, p.productCode)}
                      className="ml-1 text-[#81d742] hover:text-green-200 transition"
                      title={tx.copyCode}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleShowCode(p.productId)}
                      className="text-gray-400 hover:text-gray-200 transition"
                      title={tx.hide}
                    >
                      <EyeOff size={15} />
                    </button>
                    {copyMsg[p.productId] && (
                      <span className="ml-2 text-green-400 font-mono text-xs">{copyMsg[p.productId]}</span>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleShowCode(p.productId)}
                    className="flex items-center gap-1 text-gray-400 hover:text-[#81d742] font-mono text-xs bg-[#161616] rounded px-2 py-1 ml-1"
                    title={tx.show}
                  >
                    <Eye size={14} /> {tx.show}
                  </button>
                )}
              </div>

              <div className={`mt-4 text-xs font-semibold ${p.activated_by_admin ? "text-green-500" : "text-yellow-400"}`}>
                {p.activated_by_admin ? tx.approvedByAdmin : tx.waitingApproval}
              </div>

              <div className="flex flex-col gap-2 mt-auto pt-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(p)}
                    className="bg-[#262f24] hover:bg-[#273427] text-[#d1ffd0] py-2 rounded text-sm flex-1 transition"
                  >
                    {tx.edit}
                  </button>
                  <button
                    onClick={() => handleToggleActive(p.productId, p.isActive ? "deactivate" : "activate")}
                    className={`${p.isActive ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"} text-white py-2 rounded text-sm flex-1`}
                  >
                    {p.isActive ? tx.deactivate : tx.activate}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EDIT MODAL — responsive, scrollable, closable on mobile */}
      {editOpen && editOriginal && (
        <div className="fixed inset-0 z-50 p-2 sm:p-6">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60" onClick={closeEdit} aria-hidden="true" />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            className="relative mx-auto w-[96vw] sm:w-[min(680px,94vw)] bg-[#151716] border border-[#2a2f2a] rounded-2xl shadow-2xl
                       h-[calc(100dvh-1rem)] sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden"
          >
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-[#2a2f2a] bg-[#151716]">
              <h2 className="text-lg md:text-xl font-bold text-[#d1ffd0] truncate">
                {tx.edit} — {editOriginal.name}
              </h2>
              <button
                onClick={closeEdit}
                className="text-gray-300 hover:text-white transition"
                aria-label={tx.close}
              >
                <X size={22} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5">
              {sensitiveChanged ? (
                <div className="mb-4 bg-yellow-900/70 border border-yellow-600 text-yellow-100 px-3 py-2 rounded text-xs md:text-sm font-mono font-bold">
                  ⚠️ {tx.adminApprovalWarn}
                </div>
              ) : (
                <div className="mb-4 bg-[#1b2519] border border-[#2b3b2a] text-[#c8f7c8] px-3 py-2 rounded text-xs md:text-sm font-mono">
                  {t("commissionTip") || "set a competitive rate to get more promoters"}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-[#9fd59f] font-mono">{tx.productImage}</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                    <input
                      type="text"
                      className={`${inputBase} focus:ring-[#81d742] md:col-span-2 ${editSubmitted && editErrors.image_url ? "border-red-500 focus:ring-red-400" : ""}`}
                      value={edit.image_url}
                      onChange={(e) => setEdit((s) => ({ ...s, image_url: e.target.value }))}
                      placeholder={tx.productImage}
                    />
                    <img
                      src={
                        sanitizeImageUrl(edit.image_url) ||
                        sanitizeImageUrl(editOriginal.image_url) ||
                        PLACEHOLDER
                      }
                      onError={handleImgError}
                      alt="preview"
                      className="rounded-lg w-full h-32 object-cover border border-[#202720]"
                      style={{ background: "#23262a" }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">{tx.imageHint}</p>
                  {editSubmitted && editErrors.image_url && (
                    <p className="mt-1 text-xs text-red-400">{editErrors.image_url}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#9fd59f] font-mono">{tx.productTitle}</label>
                  <input
                    type="text"
                    className={`${inputBase} focus:ring-[#81d742] ${editSubmitted && editErrors.name ? "border-red-500 focus:ring-red-400" : ""}`}
                    value={edit.name}
                    onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                  />
                  {editSubmitted && editErrors.name && (
                    <p className="mt-1 text-xs text-red-400">{editErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#9fd59f] font-mono">{tx.productUrl}</label>
                  <input
                    type="url"
                    className={`${inputBase} focus:ring-[#81d742] ${editSubmitted && editErrors.merchant_url ? "border-red-500 focus:ring-red-400" : ""}`}
                    value={edit.merchant_url}
                    onChange={(e) => setEdit((s) => ({ ...s, merchant_url: e.target.value }))}
                  />
                  {editSubmitted && editErrors.merchant_url && (
                    <p className="mt-1 text-xs text-red-400">{editErrors.merchant_url}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#9fd59f] font-mono">{tx.productPrice}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className={`${inputBase} focus:ring-[#81d742] ${editSubmitted && editErrors.price ? "border-red-500 focus:ring-red-400" : ""}`}
                    value={edit.price}
                    onChange={(e) => setEdit((s) => ({ ...s, price: e.target.value }))}
                  />
                  {editSubmitted && editErrors.price && (
                    <p className="mt-1 text-xs text-red-400">{editErrors.price}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#9fd59f] font-mono">{tx.commissionRate}</label>
                  <input
                    type="number"
                    step="0.1"
                    min={minCommission}
                    max={99.9}
                    className={`${inputBase} focus:ring-[#81d742] ${editSubmitted && editErrors.commissionRate ? "border-red-500 focus:ring-red-400" : ""}`}
                    value={edit.commissionRate}
                    onChange={(e) => setEdit((s) => ({ ...s, commissionRate: e.target.value }))}
                    onBlur={() =>
                      setEdit((s) => ({ ...s, commissionRate: clampCommission(s.commissionRate) }))
                    }
                  />
                  <div className="mt-1 text-[11px] text-gray-400">
                    {tx.minLabel} {minCommission}%
                  </div>
                  {editSubmitted && editErrors.commissionRate && (
                    <p className="mt-1 text-xs text-red-400">{editErrors.commissionRate}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#9fd59f] font-mono">{tx.maxSalesLimit}</label>
                  <input
                    type="number"
                    min={Math.max(1, Number(editOriginal.total_purchases))}
                    step={1}
                    className={`${inputBase} focus:ring-[#81d742] ${editSubmitted && editErrors.max_sales_limit ? "border-red-500 focus:ring-red-400" : ""}`}
                    value={edit.max_sales_limit}
                    onChange={(e) => setEdit((s) => ({ ...s, max_sales_limit: e.target.value }))}
                    onBlur={() =>
                      setEdit((s) => ({
                        ...s,
                        max_sales_limit: clampLimit(s.max_sales_limit, editOriginal.total_purchases),
                      }))
                    }
                  />
                  <div className="mt-1 text-[11px] text-gray-400">
                    ({t("sold") || "sold"}: {editOriginal.total_purchases})
                  </div>
                  {editSubmitted && editErrors.max_sales_limit && (
                    <p className="mt-1 text-xs text-red-400">{editErrors.max_sales_limit}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-[#9fd59f] font-mono">{tx.productDesc}</label>
                  <textarea
                    rows={3}
                    className={`${inputBase} w-full focus:ring-[#81d742]`}
                    value={edit.description}
                    onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Sticky footer (always visible on mobile) */}
            <div className="sticky bottom-0 z-10 bg-[#151716]/95 backdrop-blur border-t border-[#2a2f2a] px-3 md:px-5 py-3 md:py-4
                            pb-[max(env(safe-area-inset-bottom,0),0.75rem)] flex gap-3 justify-end">
              <button
                onClick={saveEdit}
                disabled={loading}
                className="bg-[#81d742] px-4 py-2 rounded font-semibold text-[#0b0b0b] hover:bg-[#aaff6c] text-sm disabled:opacity-60"
              >
                {tx.save}
              </button>
              <button
                onClick={closeEdit}
                disabled={loading}
                className="bg-[#a94a4a] px-4 py-2 rounded font-semibold hover:bg-[#ff6a6a] text-sm disabled:opacity-60 text-white"
              >
                {tx.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </MerchantLayout>
  );
}

export const runtime = "nodejs";
