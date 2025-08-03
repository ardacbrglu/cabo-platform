"use client";
import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import MerchantLayout from "@/components/merchant/MerchantLayout";
import { usePathname, useRouter } from "next/navigation";
// Eğer çeviri ve locale hook'un varsa:
import { useTranslation } from "@/hooks/useTranslation"; // (isteğe bağlı)
// import { useLocale } from "@/context/LocaleContext";

const COLOR_CABO = "#d1ffd0";
const COLOR_GREEN = "#81d742";

const statusLabels = {
  pending: "Pending",
  merchant_paid: "Paid (Waiting Confirm)",
  platform_confirmed: "Confirmed",
  rejected: "Rejected",
};
const ROWS_PER_PAGE = 8;

function formatAmount(eur) {
  return (Number(eur).toLocaleString("en-US", { minimumFractionDigits: 2 })) + " €";
}
function getstatusStyle(status) {
  if (status === "pending") return "bg-yellow-900/60 text-[#ffe7a1]";
  if (status === "merchant_paid") return "bg-green-900/60 text-[#b2ffa6]";
  if (status === "platform_confirmed") return "bg-cyan-900/60 text-[#a6fffb]";
  if (status === "rejected") return "bg-red-900/60 text-[#f3aaaa]";
  return "bg-gray-800 text-gray-200";
}
function getSalestatusStyle(status) {
  if (status === "confirmed") return "bg-green-900/60 text-[#81d742]";
  if (status === "pending") return "bg-yellow-900/60 text-yellow-300";
  if (status === "rejected") return "bg-red-900/60 text-red-400";
  return "bg-gray-800 text-gray-200";
}

export default function MerchantPaymentsPage() {
  // const { t, locale } = useTranslation(); // i18n için hazırla (isteğe bağlı)
  // const { locale } = useLocale(); // veya context varsa
  const t = (s) => s; // şimdilik düz metin, i18n bağlayabilirsin

  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showPayPopup, setShowPayPopup] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState(false);

  // Details modal state
  const [showDetails, setShowDetails] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsData, setDetailsData] = useState([]);
  const [detailsAffiliate, setDetailsAffiliate] = useState("");
  const [detailsMeta, setDetailsMeta] = useState(null);
  const pathname = usePathname();

  // Fetch items
  useEffect(() => {
    setSelected([]);
    setSelectAll(false);
    fetch(`/api/merchant_payments?page=${page}&limit=${ROWS_PER_PAGE}`, {
      credentials: "include",
    })
      .then(res => res.json())
      .then(data => {
        setItems(data.items || []);
        setTotal(data.total || 0);
      });
  }, [page, paySuccess]);

  // Select all logic (sadece pending'ler için toplu seçim)
  useEffect(() => {
    if (selectAll) {
      setSelected(
        items
          .filter(item => item.status === "pending")
          .map(item => item.itemIds)
          .flat()
      );
    } else {
      setSelected([]);
    }
    // eslint-disable-next-line
  }, [selectAll, items]);

  function handleSelect(itemIds, checked, isPending) {
    if (!isPending) return;
    if (checked) {
      setSelected(prev => Array.from(new Set([...prev, ...itemIds])));
    } else {
      setSelected(prev => prev.filter(id => !itemIds.includes(id)));
      setSelectAll(false);
    }
  }

  function handleSelectAllChange(e) {
    setSelectAll(e.target.checked);
  }

  // Payment
  async function handleMakePayment() {
    setPaying(true);
    setPayError("");
    setPaySuccess(false);
    try {
      const res = await fetch("/api/merchant_make_payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: selected }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Payment failed");
      setPaySuccess(true);
      setShowPayPopup(false);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  }

  async function handleShowDetails(item) {
    setShowDetails(true);
    setDetailsLoading(true);
    setDetailsError("");
    setDetailsData([]);
    setDetailsAffiliate(item.affiliate_name || "");
    try {
      const res = await fetch(`/api/merchant_payment_details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: item.itemIds }),
      });
      const data = await res.json();
      if (data.details && Array.isArray(data.details)) {
        setDetailsData(data.details);
        setDetailsMeta(data.meta);
      } else {
        setDetailsData([]);
        setDetailsMeta(null);
        setDetailsError("No payout sales found.");
      }
    } catch (err) {
      setDetailsError("Failed to load details.");
      setDetailsMeta(null);
    }
    setDetailsLoading(false);
  }

  // Pagination
  const pageCount = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));

  // Platform Bank Info
  const [platformBank, setPlatformBank] = useState(null);
  useEffect(() => {
    if (!showPayPopup) return;
    fetch("/api/platform_info", { credentials: "include" })
      .then(res => res.json())
      .then(setPlatformBank);
  }, [showPayPopup]);

  // Export to CSV
  function handleExport() {
    let csv = [["Affiliate", "Amount", "Requested At", "status"].join(",")];
    for (const item of items) {
      csv.push([
        `"${item.affiliate_name}"`,
        `"${formatAmount(item.amount)}"`,
        `"${item.requested_at}"`,
        `"${statusLabels[item.status] || item.status}"`
      ].join(","));
    }
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "merchant_payments.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Govde
  return (
    <MerchantLayout>
      <div className="flex items-center gap-2 mb-7 flex-wrap">
        <span className="text-3xl font-extrabold tracking-tight" style={{ color: COLOR_CABO }}>
          Merchant Payments
        </span>
        <span className="text-[#85a48b] text-base ml-3">
          Manage and review all commission payouts to your affiliates. Track payments for each user, view payout statuses, and access detailed transaction history for every affiliate sale.
        </span>
      </div>
      {/* Export & Pay buttons */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="checkbox"
          className="scale-110 accent-[#81d742]"
          checked={selectAll}
          onChange={handleSelectAllChange}
          title="Select all"
        />
        <button
          className="bg-[#181d17] hover:bg-[#212921] text-[#caffb6] px-4 py-2 rounded shadow font-medium border border-[#222]"
          onClick={handleExport}
        >
          Export to CSV
        </button>
        <button
          className={`bg-[#232723] hover:bg-[#192319] text-[#e7ffe4] px-4 py-2 rounded shadow font-semibold border border-[#2d2] transition disabled:opacity-40`}
          disabled={selected.length === 0 || paying}
          onClick={() => setShowPayPopup(true)}
        >
          Mark as Paid
        </button>
      </div>
      {/* Payments Table */}
      <div className="rounded-xl overflow-x-auto bg-[#181818] border border-[#222] shadow mb-6">
        <table className="min-w-full text-xs font-mono text-left">
          <thead>
            <tr className="text-[#baffc1] border-b border-[#222] text-base">
              <th className="p-3"></th>
              <th className="p-3">Affiliate</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">Requested At</th>
              <th className="p-3">status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500 text-lg">
                  No payouts found.
                </td>
              </tr>
            )}
            {items.map((item, idx) => (
              <tr
                key={item.requestId + "-" + item.affiliate_id}
                className="border-b border-[#222] hover:bg-[#1e261f] transition"
                style={{ height: "56px" }}
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    className="scale-110 accent-[#81d742]"
                    checked={selected.some(id => item.itemIds.includes(id))}
                    onChange={e =>
                      handleSelect(item.itemIds, e.target.checked, item.status === "pending")
                    }
                    disabled={item.status !== "pending"}
                  />
                </td>
                <td className="p-3 font-semibold">{item.affiliate_name}</td>
                <td className="p-3 text-right font-bold" style={{ color: COLOR_GREEN }}>
                  {formatAmount(item.amount)}
                </td>
                <td className="p-3">{item.requested_at?.replace("T", " ").substring(0, 19)}</td>
                <td className="p-3">
                  <span
                    className={`font-bold px-2 py-1 rounded ${getstatusStyle(item.status)}`}
                  >
                    {statusLabels[item.status] || item.status}
                  </span>
                </td>
                <td className="p-3">
                  <button
                    className="text-blue-400 hover:underline font-bold text-xs"
                    onClick={() => handleShowDetails(item)}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex gap-3 justify-center mt-6 items-center">
          <button
            className="px-3 py-1 rounded bg-[#232323] text-gray-300 hover:bg-[#222] transition disabled:opacity-40"
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            {"<"}
          </button>
          <span className="font-semibold text-[#caffb6] text-base">
            Page {page} / {pageCount}
          </span>
          <button
            className="px-3 py-1 rounded bg-[#232323] text-gray-300 hover:bg-[#222] transition disabled:opacity-40"
            disabled={page === pageCount}
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
          >
            {">"}
          </button>
        </div>
      )}
      {/* Make Payment Popup */}
      {showPayPopup && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center">
          <div className="bg-[#161a16] rounded-2xl p-8 shadow-xl min-w-[350px] max-w-sm w-full border border-[#344f29]">
            <h3 className="text-2xl font-bold mb-3 text-[#e7ffe4]">Make Payment</h3>
            <div className="mb-4">
              <div className="text-sm text-[#caffb6] font-semibold mb-2">Platform Bank Info:</div>
              <div className="text-base mb-1">
                <span className="font-bold">Bank:</span>{" "}
                {platformBank?.platform_account_name || "-"} / {platformBank?.platform_iban || "-"}
              </div>
              <div className="text-base">
                <span className="font-bold">IBAN:</span> {platformBank?.platform_iban || "-"}
              </div>
            </div>
            <div className="text-lg text-[#afffb2] font-bold mb-4">
              Total Amount:{" "}
              {formatAmount(
                items
                  .filter(i =>
                    i.itemIds.some(id => selected.includes(id))
                  )
                  .reduce((sum, i) => sum + i.amount, 0)
              )}
            </div>
            {payError && <div className="text-red-400 mb-2">{payError}</div>}
            <div className="flex gap-4 mt-4 justify-end">
              <button
                className="bg-[#191d15] text-[#bbffd6] px-4 py-2 rounded border border-[#2d2] font-semibold hover:bg-[#232723] transition"
                onClick={handleMakePayment}
                disabled={paying}
              >
                {paying ? (
                  <span className="flex gap-2 items-center"><Loader2 className="animate-spin" size={17} /> Processing...</span>
                ) : (
                  "I Made the Payment"
                )}
              </button>
              <button
                className="bg-[#272c25] text-[#f4fff4] px-4 py-2 rounded border border-[#292] font-semibold hover:bg-[#242924] transition"
                onClick={() => setShowPayPopup(false)}
                disabled={paying}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[#181818] rounded-lg shadow-lg p-7 w-[670px] max-w-full relative font-mono border border-[#232323]">
            <button className="absolute right-4 top-3 text-gray-400 hover:text-red-400" onClick={() => setShowDetails(false)}>
              <svg width="24" height="24"><path fill="currentColor" d="M6 6L18 18M6 18L18 6"/></svg>
            </button>
            <h2 className="font-bold text-xl mb-2 text-[#d1ffd0] tracking-tight">Payout Request Details</h2>
            <div className="mb-2 text-xs text-gray-400 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span><span className="font-bold text-[#d1ffd0]">Affiliate:</span> {detailsAffiliate}</span>
              <span><span className="font-bold text-[#d1ffd0]">Request Date:</span> {detailsMeta?.requestDate || "-"}</span>
              <span><span className="font-bold text-[#d1ffd0]">status:</span> 
                <span className={`ml-1 px-2 py-1 rounded border text-xs font-bold ${getstatusStyle(detailsMeta?.status)}`}>
                  {statusLabels[detailsMeta?.status] || detailsMeta?.status}
                </span>
              </span>
              <span><span className="font-bold text-[#d1ffd0]">Total:</span> <span className="text-[#81d742] font-bold">{formatAmount(detailsMeta?.total || 0)}</span></span>
              {detailsMeta?.token && (
                <span className="text-gray-500 font-light">Payout Token: <span className="text-xs break-all">{detailsMeta.token}</span></span>
              )}
            </div>
            <div className="w-full border-b border-[#232323] my-2"></div>
            <div className="overflow-x-auto rounded-xl bg-[#202620] border border-[#243823] shadow-sm max-h-[330px]">
              <table className="min-w-full text-xs font-mono">
                <thead>
                  <tr className="text-[#baffc1] border-b border-[#232323]">
                    <th className="py-2 px-3">Merchant Order ID</th>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3 text-right">Commission</th>
                    <th className="py-2 px-3 text-right">quantity</th>
                    <th className="py-2 px-3">Sale Date</th>
                    <th className="py-2 px-3">Sale status</th>
                    <th className="py-2 px-3">Token</th>
                  </tr>
                </thead>
                <tbody>
                  {detailsLoading && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-gray-500">
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      </td>
                    </tr>
                  )}
                  {!detailsLoading && detailsError && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-red-400">{detailsError}</td>
                    </tr>
                  )}
                  {!detailsLoading && !detailsError && detailsData.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-gray-500">No sales found.</td>
                    </tr>
                  )}
                  {detailsData.map((sale, idx) => (
                    <tr key={idx} className="border-b border-[#232323] group">
                      <td className="py-2 px-3">{sale.orderId}</td>
                      <td className="py-2 px-3">{sale.product_name}</td>
                      <td className="py-2 px-3 text-right">{formatAmount(sale.amount)}</td>
                      <td className="py-2 px-3 text-right" style={{ color: "#81d742" }}>{formatAmount(sale.commission)}</td>
                      <td className="py-2 px-3 text-right">{sale.quantity}</td>
                      <td className="py-2 px-3">
                        <span className="font-bold text-gray-400">Sale Date:</span> {sale.sale_date || "-"}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`font-bold px-2 py-1 rounded border border-[#333] bg-[#232323]/60 text-xs ${getSalestatusStyle(sale.status)}`}>
                          {sale.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[11px] text-gray-300 font-mono">
                        <span className="break-all">{sale.token}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-4">
              <button
                className="bg-[#232923] text-[#caffb6] px-7 py-2 rounded font-bold text-base border border-[#232] hover:bg-[#191f17] transition"
                onClick={() => setShowDetails(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </MerchantLayout>
  );
}
