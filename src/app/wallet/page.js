"use client";

/**
 * Security Docblock (UI)
 * - All requests via apiFetch (credentials: include, X-Requested-With, X-Request-Id).
 * - CSRF header is auto-added by apiFetch when available.
 * - No sensitive details leaked in UI errors.
 * - Mobile-only UI tweaks below DO NOT affect desktop layout.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import Layout from "@/components/Layout";
import {
  Wallet2, BarChart2, Lock, Banknote, Loader2, CheckCircle,
  XCircle, X, ChevronLeft, ChevronRight, Pencil, Save, Trash2, FileText, GripVertical
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import apiFetch from "@/lib/apiFetch";
import { normalizeIban, isIbanTR } from "@/lib/iban";

const COLOR_CABO = "#d1ffd0";
const COLOR_GREEN = "#81d742";

/* basit mobil tespiti (SSR-safe) */
function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const fn = () => setM(mq.matches);
    fn();
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);
  return m;
}

/* 4’lü gruplama – sadece gösterim için */
function formatIbanGroups(raw) {
  const only = normalizeIban(raw).slice(0, 26);
  return only.replace(/(.{4})/g, "$1 ").trim();
}
const f2 = (n) => Number(n || 0).toFixed(2);

function WalletProgress({ value, max }) {
  const percent = Math.min((value / Math.max(max, 0.0001)) * 100, 100);
  const radius = 46, stroke = 6, center = 60, circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="relative shrink-0 w-[120px] h-[120px] flex items-center justify-center mb-2 select-none">
      <svg width={120} height={120} className="absolute left-0 top-0 z-0 block">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#232323" strokeWidth={stroke} />
        <circle
          cx={center} cy={center} r={radius} fill="none" stroke="#81d742" strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s" }}
        />
      </svg>
      <Wallet2 className="relative z-[1] pointer-events-none" style={{ color: "#d1ffd0", width: 56, height: 56, display: "block" }} />
    </div>
  );
}

function exportToCSV(sales, date, t) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = [
    t("orderId"),
    t("product"),
    t("amount"),
    t("commission"),
    `${t("platform")} (%)`,
    t("quantity"),
    t("date"),
  ].join(",") + "\n";
  const rows = (Array.isArray(sales) ? sales : [])
    .map((s) =>
      [s.orderId, s.product, f2(s.amount), f2(s.commission), f2(s.platformFee), s.quantity, s.convertedAt]
        .map(esc).join(",")
    )
    .join("\n");
  const csv = header + rows;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payout_details_${(date || "").slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function WalletPage() {
  const { t } = useTranslation();
  const { user, setUser } = useUser();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [pending, setPending] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [minPayout, setMinPayout] = useState(100);
  const [platformCommissionPercent, setPlatformCommissionPercent] = useState(0);

  // Profil (users) için banka
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [realName, setRealName] = useState("");
  const [ibanSaved, setIbanSaved] = useState(false);
  const [ibanError, setIbanError] = useState("");
  const [bankError, setBankError] = useState("");
  const [realNameError, setRealNameError] = useState("");

  const [history, setHistory] = useState([]);
  const [payoutState, setPayoutState] = useState({ status: "", message: "" });
  const [activeRequestCount, setActiveRequestCount] = useState(0);

  // detay modal
  const [detailsModal, setDetailsModal] = useState({
    open: false,
    sales: [],
    amountTotal: 0,
    platformCommissionTotal: 0,
    netPayable: 0,
    platformCommissionPercent: 0,
    status: "",
    date: "",
    paid_at: null,
    rejectedReason: "",
    updatedAt: null,
    bankName: "",
    iban: "",
    realName: "",
    platform_paid: false,
    platformPaidAt: null,
    page: 1,
    totalPages: 1,
    requestId: null,
    canEditBank: false,
    editIban: "",
    editBankName: "",
    editRealName: "",
    editing: false,
    editError: "",
    editSaving: false,
    cancelUntil: "",
    lockAt: "",
  });

  const [ibanMissing, setIbanMissing] = useState(true);
  const [bankMissing, setBankMissing] = useState(true);
  const [realNameMissing, setRealNameMissing] = useState(true);

  // Ayrı loading’ler — UI jitter fix
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [isPayoutSubmitting, setIsPayoutSubmitting] = useState(false);

  const PAGE_SIZE = 4;
  const [page, setPage] = useState(1);

  /* ===== Desktop kart sürükle-bırak sırası ===== */
  const DEFAULT_CARD_ORDER = ["balanceCard", "bankFormCard"];
  const [cardOrder, setCardOrder] = useState(() => {
    try {
      const raw = localStorage.getItem("wallet.cardOrder");
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.every((k) => DEFAULT_CARD_ORDER.includes(k))) return parsed;
    } catch {}
    return [...DEFAULT_CARD_ORDER];
  });
  const dragFrom = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  const onCardDragStart = (id) => {
    if (isMobile) return;
    dragFrom.current = id;
  };
  const onCardDragOver = (e, overId) => {
    if (isMobile) return;
    e.preventDefault();
    setDragOverId(overId);
  };
  const onCardDrop = (overId) => {
    if (isMobile) return;
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragOverId(null);
    if (!from || from === overId) return;
    setCardOrder((arr) => {
      const a = [...arr];
      const i = a.indexOf(from);
      const j = a.indexOf(overId);
      if (i === -1 || j === -1) return a;
      a.splice(j, 0, ...a.splice(i, 1));
      try { localStorage.setItem("wallet.cardOrder", JSON.stringify(a)); } catch {}
      return a;
    });
  };

  useEffect(() => {
    if (!user?.name) {
      apiFetch("/api/me", {
        method: "GET",
        headers: { accept: "application/json", "cache-control": "no-cache", pragma: "no-cache" },
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.name) {
            setUser((u) => ({ ...u, name: data.name, email: data.email, userId: data.userId || data.id, role: data.role }));
          }
        })
        .catch(() => {});
    }
  }, [user, setUser]);

  const refreshData = () => {
    setLoading(true);
    apiFetch("/api/wallet", {
      method: "GET",
      headers: { accept: "application/json", "cache-control": "no-cache", pragma: "no-cache" },
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/wallet ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setBalance(Number(data.balance) || 0);
        setPending(Number(data.pendingAmount) || 0);
        setConfirmed(Number(data.confirmed) || 0);
        setMinPayout(Number(data.minPayout) || 100);
        setPlatformCommissionPercent(Number(data.platformCommissionPercent) || 0);

        setIban(formatIbanGroups(data.iban || ""));
        setBankName(data.bankName || "");
        setRealName(data.realName || "");
        setIbanMissing(!!data.ibanMissing);
        setBankMissing(!!data.bankMissing);
        setRealNameMissing(!!data.realNameMissing);

        setActiveRequestCount(Number(data.activeRequestCount || 0));
        setHistory(Array.isArray(data.history) ? data.history : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { refreshData(); }, []);

  function validateRealName(val) {
    const s = String(val || "").trim();
    return s.split(/\s+/).length >= 2 && s.length >= 4;
  }

  async function handleIbanSave(e) {
    e.preventDefault();
    setIbanError(""); setBankError(""); setRealNameError("");

    const ibanNorm = normalizeIban(iban);
    if (!isIbanTR(ibanNorm)) {
      setIbanError(t("invalidIban"));
      return;
    }
    if (!String(bankName).trim()) {
      setBankError(t("bankNameRequired"));
      return;
    }
    if (!validateRealName(realName)) {
      setRealNameError(t("realNameRequired"));
      return;
    }

    setIsSavingBank(true);
    try {
      const res = await apiFetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { iban: ibanNorm, bankName, realName }, // PROFİL (users) güncelle
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIbanSaved(true);
        setTimeout(() => setIbanSaved(false), 2000);
        refreshData();
      } else {
        setIbanError(data?.error || t("unknownError"));
      }
    } catch {
      setIbanError(t("unknownError"));
    } finally {
      setIsSavingBank(false);
    }
  }

  async function handleRequestPayout() {
    if (isPayoutSubmitting) return;
    setIsPayoutSubmitting(true);
    setPayoutState({ status: "loading", message: "" });
    try {
      const res = await apiFetch("/api/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": (typeof crypto !== "undefined" && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`
        },
        body: { requestPayout: true }, // USERS’daki son bankayı snapshotla
      });
      await res.json().catch(() => ({}));
      if (res.ok) {
        setPayoutState({ status: "success", message: t("payoutRequested") });
        refreshData();
      } else {
        setPayoutState({ status: "error", message: t("unknownError") });
      }
    } catch {
      setPayoutState({ status: "error", message: t("unknownError") });
    } finally {
      setIsPayoutSubmitting(false);
      setTimeout(() => setPayoutState({ status: "", message: "" }), 2500);
    }
  }

  async function handleCancelRequest(requestId) {
    if (isPayoutSubmitting) return;
    if (!window.confirm(t("cancelPayoutConfirm"))) return;

    setIsPayoutSubmitting(true);
    setPayoutState({ status: "loading", message: "" });
    try {
      const res = await apiFetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { cancelRequest: true, requestId },
      });
      await res.json().catch(() => ({}));
      if (res.ok) {
        setPayoutState({ status: "success", message: t("cancelled") });
        refreshData();
      } else {
        setPayoutState({ status: "error", message: t("unknownError") });
      }
    } catch {
      setPayoutState({ status: "error", message: t("unknownError") });
    } finally {
      setIsPayoutSubmitting(false);
      setTimeout(() => setPayoutState({ status: "", message: "" }), 2500);
    }
  }

  async function handleDeleteRequest(requestId) {
    if (!window.confirm(t("deleteRejectedConfirm") || "Reddedilmiş talebi silinsin mi?")) return;
    try {
      const res = await apiFetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { deleteRequest: true, requestId },
      });
      if (res.ok) refreshData();
    } catch {}
  }

  const fetchDetails = async (requestId, pageNum = 1) => {
    try {
      const res = await apiFetch("/api/payout_request_details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { requestId, page: pageNum, pageSize: 10 },
      });
      if (!res.ok) return;
      const data = await res.json();

      setDetailsModal((modal) => ({
        ...modal,
        ...data,
        open: true,
        page: pageNum,
        totalPages: data.totalPages || 1,
        requestId,
        canEditBank: !!data.canEditBank,
        editIban: formatIbanGroups(data.iban || ""),
        editBankName: data.bankName || "",
        editRealName: data.realName || "",
        cancelUntil: data.lockAt || "",
        lockAt: data.lockAt || "",
        editError: "",
      }));
    } catch {}
  };

  function openDetails(requestId) {
    if (!requestId) return;
    fetchDetails(requestId, 1);
  }
  function closeDetails() {
    setDetailsModal((m) => ({ ...m, open: false }));
  }

  async function handleUpdateRequestBank() {
    if (!detailsModal.requestId) return;

    const ibanNorm = normalizeIban(detailsModal.editIban);
    if (!isIbanTR(ibanNorm)) {
      setDetailsModal((m) => ({ ...m, editError: t("invalidIban") }));
      return;
    }
    if (!String(detailsModal.editBankName).trim()) {
      setDetailsModal((m) => ({ ...m, editError: t("bankNameRequired") }));
      return;
    }
    const rn = String(detailsModal.editRealName || "").trim();
    if (rn.split(/\s+/).length < 2) {
      setDetailsModal((m) => ({ ...m, editError: t("realNameRequired") }));
      return;
    }

    setDetailsModal((m) => ({ ...m, editSaving: true, editError: "" }));
    try {
      // SADECE TALEP SNAPSHOT’I — users tablosu etkilenmez
      const res = await apiFetch("/api/payout_request_details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          updateRequestBank: true,
          requestId: detailsModal.requestId,
          iban: ibanNorm,
          bankName: detailsModal.editBankName,
          realName: detailsModal.editRealName,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetailsModal((m) => ({
          ...m,
          bankName: m.editBankName,
          iban: formatIbanGroups(ibanNorm),
          realName: m.editRealName,
          editSaving: false,
          editing: false,
          editError: "",
        }));
        refreshData();
      } else if (data?.error === "LOCKED") {
        setDetailsModal((m) => ({ ...m, editSaving: false, editError: t("lockedUpdateWindowPassed") }));
      } else {
        setDetailsModal((m) => ({ ...m, editSaving: false, editError: t("unknownError") }));
      }
    } catch {
      setDetailsModal((m) => ({ ...m, editSaving: false, editError: t("unknownError") }));
    }
  }

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((history.length || 0) / PAGE_SIZE)),
    [history.length]
  );
  let paginatedHistory = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (paginatedHistory.length < PAGE_SIZE) {
    paginatedHistory = [...paginatedHistory, ...Array(PAGE_SIZE - paginatedHistory.length).fill(null)];
  }
  useEffect(() => { if (page > totalPages && totalPages > 0) setPage(totalPages); }, [history, totalPages, page]);

  const payoutDisabled =
    loading ||
    isPayoutSubmitting ||
    ibanMissing || bankMissing || realNameMissing ||
    confirmed < minPayout ||
    activeRequestCount >= 2;

  const disabledReason =
    ibanMissing || bankMissing || realNameMissing
      ? "bank"
      : activeRequestCount >= 2
      ? "activeLimit"
      : confirmed < minPayout
      ? "min"
      : "";

  const showInlineWarn = !loading && (ibanMissing || bankMissing || realNameMissing);
  const InlineWarn = () => (
    <div
      className="w-full border border-red-700/70 bg-red-900/40 text-red-200 rounded-lg px-3 py-2 mb-3 text-[11px] sm:text-xs font-mono"
      role="status"
      aria-live="polite"
    >
      <b className="font-bold">{t("bankInfoMissing")}</b>{" "}
      <span className="opacity-90">{t("bankInfoExplain")}</span>
      <div className="mt-1 space-x-2 text-[10.5px] sm:text-[11.5px]">
        {ibanMissing && <span>• {t("ibanMissing")}</span>}
        {bankMissing && <span>• {t("bankNameMissing")}</span>}
        {realNameMissing && <span>• {t("realNameMissing")}</span>}
      </div>
    </div>
  );

  /* ==== Kart içerikleri ==== */
  const renderBalanceCard = () => (
    <div
      data-id="balanceCard"
      draggable={!isMobile}
      onDragStart={() => onCardDragStart("balanceCard")}
      onDragOver={(e) => onCardDragOver(e, "balanceCard")}
      onDrop={() => onCardDrop("balanceCard")}
      aria-grabbed="false"
      className={[
        "bg-[#181818] rounded-xl shadow py-5 px-3 sm:py-7 sm:px-8 flex flex-col items-center min-w-[240px] h-full",
        "md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,.25)]",
        dragOverId === "balanceCard" ? "ring-1 ring-[#2a2a2a]" : "",
      ].join(" ")}
      style={{ willChange: "transform" }}
    >
      {/* drag handle (desktop) */}
      <div className="hidden md:flex w-full justify-end -mt-2 -mr-1">
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 px-1.5 py-0.5 rounded cursor-move select-none">
          <GripVertical size={14} /> {t("drag") || "Taşı"}
        </span>
      </div>

      {/* Başlık rengi diğer kartlarla aynı */}
      <div className="font-extrabold text-xl sm:text-2xl mb-2 font-mono" style={{ color: COLOR_CABO }}>
        {t("wallet")}
      </div>
      {loading ? <Loader2 className="animate-spin text-gray-400 my-7" size={44} /> : <WalletProgress value={confirmed} max={minPayout} />}
      <div className="flex flex-col items-center mb-4">
        <span className="font-mono text-gray-400 text-xs">{t("confirmedBalance")}</span>
        <span className="text-xl sm:text-2xl font-extrabold font-mono" style={{ color: COLOR_CABO }}>
          ₺{f2(confirmed)}
        </span>
        <span className="text-xs text-gray-400 font-mono mb-1">({t("readyToWithdraw")})</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 justify-center font-mono text-xs mb-2">
        <span className="bg-[#222] rounded px-2 py-1 text-[#e3d67d] font-bold">
          {t("pending")}: ₺{f2(pending)}
        </span>
        <span className="bg-[#232323] rounded px-2 py-1 text-[#81d742]">
          {t("total")}: ₺{f2(balance)}
        </span>
      </div>
      <div className="mb-1 text-xs font-mono">
        <span style={{ color: "#81d742" }}>{t("minPayout")}:</span>
        <span className="font-bold" style={{ color: COLOR_GREEN }}> ₺{minPayout}</span>
      </div>
      <div className="mb-3 text-[11px] font-mono text-[#e3d67d]">
        {t("platformCommissionShort")}: %{platformCommissionPercent}
      </div>
      <div className="mt-2 text-xs font-bold animate-pulse font-mono text-center" style={{ color: confirmed < minPayout ? "#e3d67d" : COLOR_GREEN }}>
        {confirmed < minPayout ? (
          <>
            {t("earnMoreToPayout")} <span style={{ color: COLOR_CABO }}>{f2(minPayout - confirmed)}₺</span>
          </>
        ) : (
          <>{t("eligibleForPayout")}</>
        )}
      </div>

      {/* Buton: her durumda merkezde, min-h sabit */}
      <div className="w-full flex justify-center">
        <button
          className={[
            "mt-4 w-[92%] sm:w-full max-w-[360px] min-h-[44px] rounded font-bold font-mono text-[#181818]",
            payoutDisabled ? "bg-[#323232] text-gray-500 cursor-not-allowed" : "bg-[#81d742] hover:bg-[#a9ff72] transition",
            "text-base mb-1 inline-flex items-center justify-center gap-1 leading-tight",
          ].join(" ")}
          style={{ fontSize: "1.05rem" }}
          disabled={payoutDisabled}
          onClick={handleRequestPayout}
          aria-disabled={payoutDisabled}
          aria-live="polite"
        >
          {isPayoutSubmitting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : payoutDisabled ? (
            <>
              <Lock size={18} />
              <span className="text-center">
                {disabledReason === "bank" && t("walletRequirements")}
                {disabledReason === "activeLimit" && t("activeRequestLimitReached")}
                {disabledReason === "min" && t("minThresholdNotMet")}
              </span>
            </>
          ) : (
            <>
              <Banknote size={18} /> {t("requestPayout")}
            </>
          )}
        </button>
      </div>

      {!loading && payoutDisabled && disabledReason === "activeLimit" && (
        <div className="text-[11px] text-yellow-300 font-mono mt-1 text-center">
          {t("activeRequestLimitReached")}
        </div>
      )}

      {payoutState.status === "success" && (
        <div className="flex items-center gap-1 mt-2 text-green-400 text-xs font-bold font-mono" role="status" aria-live="polite">
          <CheckCircle size={16} /> {payoutState.message}
        </div>
      )}
      {payoutState.status === "error" && (
        <div className="flex items-center gap-1 mt-2 text-red-400 text-xs font-bold font-mono" role="alert" aria-live="assertive">
          <XCircle size={16} /> {payoutState.message}
        </div>
      )}
    </div>
  );

  const renderBankFormCard = () => (
    <div
      data-id="bankFormCard"
      draggable={!isMobile}
      onDragStart={() => onCardDragStart("bankFormCard")}
      onDragOver={(e) => onCardDragOver(e, "bankFormCard")}
      onDrop={() => onCardDrop("bankFormCard")}
      aria-grabbed="false"
      className={[
        "bg-[#181818] rounded-xl shadow py-5 px-3 sm:py-7 sm:px-7 flex flex-col items-center min-w-[240px] h-full",
        "md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,.25)]",
        dragOverId === "bankFormCard" ? "ring-1 ring-[#2a2a2a]" : "",
      ].join(" ")}
      style={{ willChange: "transform" }}
    >
      {/* drag handle (desktop) */}
      <div className="hidden md:flex w-full justify-end -mt-2 -mr-1">
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 px-1.5 py-0.5 rounded cursor-move select-none">
          <GripVertical size={14} /> {t("drag") || "Taşı"}
        </span>
      </div>

      <div className="font-extrabold text-lg sm:text-xl font-mono mb-3" style={{ color: COLOR_CABO }}>
        {t("paymentDetails")}
      </div>

      {showInlineWarn && <InlineWarn />}

      <form className="w-full" onSubmit={handleIbanSave} noValidate>
        <label className="block text-xs font-bold text-[#d1ffd0] font-mono mb-1">{t("iban")}</label>
        <input
          type="text"
          className={`bg-[#161616] border ${ibanError ? "border-red-500" : "border-[#222]"} rounded px-4 py-2 mb-1 text-white w-full outline-none text-sm font-mono tracking-wider`}
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          value={iban}
          onChange={(e) => setIban(formatIbanGroups(e.target.value))}
          onBlur={(e) => setIban(formatIbanGroups(e.target.value))}
          onPaste={(e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData)?.getData?.("text") || "";
            setIban(formatIbanGroups(text));
          }}
          required
          maxLength={34}
          autoComplete="off"
          inputMode="text"
          aria-invalid={!!ibanError}
        />
        {ibanError && <div className="text-xs text-red-400 mb-1 font-mono" aria-live="assertive">{ibanError}</div>}

        <label className="block text-xs font-bold text-[#d1ffd0] font-mono mb-1">{t("bankName")}</label>
        <input
          type="text"
          className={`bg-[#161616] border ${bankError ? "border-red-500" : "border-[#222]"} rounded px-4 py-2 mb-1 text-white w-full outline-none text-sm font-mono`}
          placeholder="Ziraat Bank, Garanti BBVA..."
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          required
          maxLength={120}
          autoComplete="off"
          inputMode="text"
          aria-invalid={!!bankError}
        />
        {bankError && <div className="text-xs text-red-400 mb-1 font-mono" aria-live="assertive">{bankError}</div>}

        <label className="block text-xs font-bold text-[#d1ffd0] font-mono mb-1">{t("fullRealName")}</label>
        <input
          type="text"
          className={`bg-[#161616] border ${realNameError ? "border-red-500" : "border-[#222]"} rounded px-4 py-2 mb-1 text-white w-full outline-none text-sm font-mono`}
          placeholder={t("yourLegalName")}
          value={realName}
          onChange={(e) => setRealName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
          inputMode="text"
          aria-invalid={!!realNameError}
        />
        {realNameError && <div className="text-xs text-red-400 mb-1 font-mono" aria-live="assertive">{realNameError}</div>}

        {/* Kaydet butonu */}
        <div className="w-full flex justify-center">
          <button
            type="submit"
            disabled={isSavingBank}
            className={`w-[92%] sm:w-full max-w-[360px] py-2 rounded font-bold font-mono bg-[#81d742] hover:bg-[#a9ff72] text-[#181818] text-base transition mt-2 ${isSavingBank ? "opacity-60 pointer-events-none" : ""}`}
          >
            {ibanSaved ? t("saved") : t("saveBankInfo")}
          </button>
        </div>
      </form>
      <div className="mt-3 text-[11px] sm:text-xs text-gray-400 font-mono text-center leading-snug">
        {t("bankInfoNote")}
      </div>
    </div>
  );

  /* ====== Render ====== */
  return (
    <Layout>
      {/* daha ferah dikey boşluk (footer’a yapışma yok) */}
      <main className="flex flex-col items-center w-full max-w-5xl mx-auto flex-1 justify-start py-8 md:py-10 gap-8 px-3 md:px-4">
        {/* Desktop: grid → aynı yükseklikte kartlar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8 w-full items-stretch">
          {cardOrder.map((k) => (
            <div key={k} className="flex-1 min-w-[240px] h-full">
              {k === "balanceCard" ? renderBalanceCard() : renderBankFormCard()}
            </div>
          ))}
        </div>

        {/* Payout History — draggable (desktop), hover animasyonu (desktop) */}
        <div
          data-id="historyCard"
          draggable={!isMobile}
          className={[
            "bg-[#181818] rounded-xl shadow py-6 px-3 sm:px-8 w-full mt-2 sm:max-h-[340px] sm:overflow-y-auto",
            "md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,.25)]",
          ].join(" ")}
          onDragStart={() => onCardDragStart("historyCard")}
          aria-grabbed="false"
          style={{ willChange: "transform" }}
        >
          <div className="hidden md:flex w-full justify-end -mt-2 -mr-1">
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 px-1.5 py-0.5 rounded cursor-move select-none">
              <GripVertical size={14} /> {t("drag") || "Taşı"}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="text-[#81d742]" size={19} />
            <span className="font-extrabold text-base font-mono" style={{ color: COLOR_CABO }}>
              {t("payoutHistory")}
            </span>
          </div>

          <div className="w-full overflow-x-hidden">
            <table className="w-full text-[11px] sm:text-xs font-mono text-left table-auto">
              <colgroup>
                <col className="col-date" />
                <col className="col-amount" />
                <col className="col-status" />
                <col className="col-method" />
                <col className="col-bank" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr className="text-gray-400 border-b border-[#232323]">
                  <th className="py-2 px-2 md:px-3">{t("date")}</th>
                  <th className="py-2 px-2 md:px-3 text-right">{t("amount")}</th>
                  <th className="py-2 px-2 md:px-3">{t("status")}</th>
                  <th className="py-2 px-2 md:px-3 hidden sm:table-cell">{t("method")}</th>
                  <th className="py-2 px-2 md:px-3 hidden sm:table-cell">{t("bank")}</th>
                  <th className="py-2 px-2 md:px-3"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-4">
                      {t("noPayoutsYet")}
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((item, i) =>
                    item ? (
                      <tr key={i} className="border-b border-[#202020] last:border-none">
                        <td className="py-2 px-2 md:px-3 whitespace-nowrap">{item.date}</td>
                        <td className="py-2 px-2 md:px-3 font-bold text-right tabular-nums amount-cell" style={{ color: COLOR_GREEN }}>
                          ₺{f2(item.amount || 0)}
                        </td>
                        <td className="py-2 px-2 md:px-3">
                          <span
                            className={[
                              "inline-block align-middle font-bold px-1.5 py-0.5 rounded whitespace-nowrap leading-tight",
                              item.status === "paid"
                                ? "bg-green-900/60 text-[#81d742]"
                                : item.status === "rejected"
                                ? "bg-red-900/60 text-red-400"
                                : item.status === "approved"
                                ? "bg-blue-900/60 text-blue-300"
                                : "bg-yellow-800/60 text-yellow-300",
                            ].join(" ")}
                          >
                            {t(item.status)}
                          </span>
                          {item.status === "pending" && item.lockAt && (
                            <span className="ml-2 text-gray-400 font-mono text-[10px] hidden sm:inline">
                              {(t("cancelUntil") || "Cancel until")}: {new Date(item.lockAt).toLocaleString()}
                            </span>
                          )}
                          {item.status === "pending" && !item.canCancel && (
                            <span className="ml-2 text-yellow-400 text-[10px] font-mono hidden sm:inline">
                              {t("locked") || "Locked"}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 md:px-3 hidden sm:table-cell">{item.method}</td>
                        <td className="py-2 px-2 md:px-3 hidden sm:table-cell truncate max-w-[160px]">{item.bankName || "-"}</td>
                        <td className="py-2 px-2 md:px-3">
                          <div className="flex sm:flex-row flex-col items-end sm:items-center justify-end gap-1">
                            {item.status === "pending" && item.requestId && item.canCancel && (
                              <button
                                onClick={() => handleCancelRequest(item.requestId)}
                                disabled={isPayoutSubmitting}
                                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-red-500 hover:bg-red-900/30 transition text-[11px] sm:text-xs font-mono disabled:opacity-50 w-[72px] sm:w-auto"
                                title={t("cancel")}
                              >
                                <X size={14} className="sm:mr-1" />
                                <span className="hidden sm:inline">{t("cancel")}</span>
                                <span className="sm:hidden max-[360px]:hidden">İptal</span>
                              </button>
                            )}
                            {item.status === "rejected" && item.requestId && item.canDelete && (
                              <button
                                onClick={() => handleDeleteRequest(item.requestId)}
                                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-red-400 hover:bg-red-900/30 transition text-[11px] sm:text-xs font-mono w-[72px] sm:w-auto"
                                title={t("delete")}
                              >
                                <Trash2 size={14} className="sm:mr-1" />
                                <span className="hidden sm:inline">{t("delete")}</span>
                                <span className="sm:hidden max-[360px]:hidden">Sil</span>
                              </button>
                            )}
                            <button
                              onClick={() => openDetails(item.requestId)}
                              className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-blue-400 hover:bg-blue-900/20 transition text-[11px] sm:text-xs font-mono w-[72px] sm:w-auto"
                              title={t("details") || "Detay"}
                            >
                              <FileText size={14} className="sm:mr-1" />
                              <span className="hidden sm:inline">{t("details") || "Detay"}</span>
                              <span className="sm:hidden max-[360px]:hidden">Detay</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-b border-[#202020] last:border-none">
                        <td className="py-2 px-2 md:px-3">&nbsp;</td>
                        <td className="py-2 px-2 md:px-3">&nbsp;</td>
                        <td className="py-2 px-2 md:px-3">&nbsp;</td>
                        <td className="py-2 px-2 md:px-3 hidden sm:table-cell">&nbsp;</td>
                        <td className="py-2 px-2 md:px-3 hidden sm:table-cell">&nbsp;</td>
                        <td className="py-2 px-2 md:px-3">&nbsp;</td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex justify-center mt-4 gap-2">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="px-2 py-1 rounded bg-[#232323] text-gray-300 hover:bg-[#222] disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-mono text-[#d1ffd0] px-2">
                {t("page")} {page} / {totalPages || 1}
              </span>
              <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="px-2 py-1 rounded bg-[#232323] text-gray-300 hover:bg-[#222] disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Details Modal */}
        {detailsModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-[#181818] rounded-lg shadow-lg p-3 sm:p-6 w-[94vw] sm:w-full max-w-lg relative max-h-[90svh] overflow-y-auto overscroll-contain">
              <button className="absolute right-3 top-2 text-gray-400" onClick={closeDetails}>
                <X size={18} />
              </button>
              <h2 className="font-bold mb-2 text-lg font-mono text-[#d1ffd0]">{t("payoutRequestDetails")}</h2>

              <div className="text-xs mb-3 font-mono text-gray-400">
                {t("date")}: <span>{detailsModal.date?.slice(0, 10)}</span> &nbsp; {t("status")}:{" "}
                <span className="font-bold">{t(detailsModal.status)}</span> <br />
                {t("total")}: <span style={{ color: COLOR_GREEN }}>₺{f2(detailsModal.amountTotal)}</span>
                {"  •  "}
                <span className="text-[#e3d67d]">{t("platformCommissionShort")}: ₺{f2(detailsModal.platformCommissionTotal)}</span>
                {"  •  "}
                <span className="text-[#d1ffd0]">{t("netPayable")}: ₺{f2(detailsModal.netPayable)}</span>
                {detailsModal.paid_at && (
                  <span> &middot; <span className="text-green-400">{t("paidAt")}: {new Date(detailsModal.paid_at).toLocaleDateString()}</span></span>
                )}
                {detailsModal.rejectedReason && (
                  <span> &middot; <span className="text-red-400">{t("reason")}: {detailsModal.rejectedReason}</span></span>
                )}
                {detailsModal.updatedAt && (
                  <span> &middot; <span className="text-gray-300">{t("updatedAt")}: {new Date(detailsModal.updatedAt).toLocaleDateString()}</span></span>
                )}
                <br />
                {t("bankName")}: <span className="text-[#81d742]">{detailsModal.bankName || "-"}</span> &nbsp; {t("iban")}:{" "}
                <span className="text-[#81d742]">{detailsModal.iban || "-"}</span> &nbsp; {t("name")}:{" "}
                <span className="text-[#81d742]">{detailsModal.realName || "-"}</span>
                <br />
                {detailsModal.status === "pending" && detailsModal.lockAt && (
                  <span className="text-gray-400">
                    {(t("cancelUntil") || "Cancel until")}: {new Date(detailsModal.lockAt).toLocaleString()}
                  </span>
                )}
                <br />
                {t("platformPaid")}: {detailsModal.platform_paid ? <span className="text-green-400">✔</span> : <span className="text-yellow-400">—</span>}
                {detailsModal.platformPaidAt && <span> {t("at")} {new Date(detailsModal.platformPaidAt).toLocaleDateString()}</span>}
              </div>

              {/* request bank edit (snapshot only) */}
              {detailsModal.status === "pending" && (
                <div className={`mb-3 border rounded p-2 ${detailsModal.canEditBank ? "border-[#2a2a2a]" : "border-[#3a2a2a]"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-mono text-[#d1ffd0] font-bold">
                      {t("updateBankForThisRequest") || "Update bank for this request"}
                    </div>
                    {!detailsModal.editing && detailsModal.canEditBank && (
                      <button
                        className="text-xs font-mono text-blue-300 flex items-center gap-1 hover:underline"
                        onClick={() => setDetailsModal((m) => ({ ...m, editing: true, editError: "" }))}
                      >
                        <Pencil size={14} /> {t("edit") || "Edit"}
                      </button>
                    )}
                  </div>

                  {!detailsModal.canEditBank && (
                    <div className="text-[11px] text-yellow-300 font-mono mb-2">
                      {t("lockedUpdateWindowPassed")}
                    </div>
                  )}

                  {detailsModal.editing && detailsModal.canEditBank && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          className="bg-[#161616] border border-[#222] rounded px-3 py-2 text-white text-xs font-mono tracking-wider"
                          placeholder="TR00..."
                          value={detailsModal.editIban}
                          onChange={(e) => setDetailsModal((m) => ({ ...m, editIban: formatIbanGroups(e.target.value) }))}
                          onBlur={(e) => setDetailsModal((m) => ({ ...m, editIban: formatIbanGroups(e.target.value) }))}
                          maxLength={34}
                        />
                        <input
                          className="bg-[#161616] border border-[#222] rounded px-3 py-2 text-white text-xs font-mono"
                          placeholder="Bank name"
                          value={detailsModal.editBankName}
                          onChange={(e) => setDetailsModal((m) => ({ ...m, editBankName: e.target.value }))}
                          maxLength={120}
                        />
                        <input
                          className="bg-[#161616] border border-[#222] rounded px-3 py-2 text-white text-xs font-mono"
                          placeholder={t("yourLegalName")}
                          value={detailsModal.editRealName}
                          onChange={(e) => setDetailsModal((m) => ({ ...m, editRealName: e.target.value }))}
                          maxLength={120}
                        />
                      </div>
                      {detailsModal.editError && <div className="text-xs text-red-400 font-mono">{detailsModal.editError}</div>}
                      <div className="flex items-center gap-2">
                        <button
                          disabled={detailsModal.editSaving}
                          onClick={handleUpdateRequestBank}
                          className="px-3 py-1 rounded bg-[#81d742] text-[#181818] text-xs font-mono font-bold hover:bg-[#a9ff72] disabled:opacity-50 flex items-center gap-1"
                        >
                          <Save size={14} /> {t("save")}
                        </button>
                        <button
                          disabled={detailsModal.editSaving}
                          onClick={() =>
                            setDetailsModal((m) => ({
                              ...m,
                              editing: false,
                              editError: "",
                              editIban: formatIbanGroups(m.iban),
                              editBankName: m.bankName,
                              editRealName: m.realName,
                            }))
                          }
                          className="px-3 py-1 rounded bg-[#232323] text-gray-300 text-xs font-mono hover:bg-[#222] disabled:opacity-50"
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                <table className="w-full text-xs mb-2 font-mono">
                  <thead>
                    <tr className="text-gray-400 border-b border-[#232323]">
                      <th className="text-left">{t("orderId")}</th>
                      <th className="text-left">{t("product")}</th>
                      <th className="text-right">{t("amount")}</th>
                      <th className="text-right">{t("commission")}</th>
                      <th className="text-right">
                        {t("platform")} (%{detailsModal.platformCommissionPercent || platformCommissionPercent})
                      </th>
                      <th className="text-right">{t("quantity")}</th>
                      <th className="text-right">{t("date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailsModal.sales || []).map((sale) => (
                      <tr key={sale.saleId} className="border-b border-[#232323]">
                        <td className="text-left">{sale.orderId}</td>
                        <td className="text-left">{sale.product}</td>
                        <td className="text-right tabular-nums">₺{f2(sale.amount)}</td>
                        <td className="text-right tabular-nums" style={{ color: COLOR_GREEN }}>₺{f2(sale.commission)}</td>
                        <td className="text-right tabular-nums text-[#e3d67d]">₺{f2(sale.platformFee)}</td>
                        <td className="text-right">{sale.quantity}</td>
                        <td className="text-right">{sale.convertedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center mt-2">
                <button
                  onClick={() => fetchDetails(detailsModal.requestId, detailsModal.page - 1)}
                  disabled={detailsModal.page <= 1}
                  className="px-2 py-1 bg-[#232323] rounded disabled:opacity-40"
                >
                  &lt; {t("prev")}
                </button>
                <span className="text-[#81d742] text-xs font-mono">
                  {t("page")} {detailsModal.page} / {detailsModal.totalPages}
                </span>
                <button
                  onClick={() => fetchDetails(detailsModal.requestId, detailsModal.page + 1)}
                  disabled={detailsModal.page >= detailsModal.totalPages}
                  className="px-2 py-1 bg-[#232323] rounded disabled:opacity-40"
                >
                  {t("next")} &gt;
                </button>
              </div>
              <button
                onClick={() => exportToCSV(detailsModal.sales, detailsModal.date, t)}
                className="mt-2 py-1 px-4 rounded bg-[#81d742] text-[#181818] font-bold text-xs font-mono hover:bg-[#a9ff72]"
              >
                {t("exportToCsv")}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* mobil sütun hizalama */}
      <style jsx>{`
        @media (max-width: 640px) {
          .col-date   { width: 34%; }
          .col-amount { width: 24%; }
          .col-status { width: 26%; }
          .col-actions{ width: 16%; }
          .amount-cell{ min-width: 74px; }
        }
      `}</style>

      {/* yalnız tabular-nums yardımcı sınıfı */}
      <style jsx global>{`
        .tabular-nums { font-variant-numeric: tabular-nums; }
      `}</style>
    </Layout>
  );
}
