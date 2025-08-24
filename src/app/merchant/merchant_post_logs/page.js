"use client";

import { useEffect, useMemo, useState } from "react";
import MerchantLayout from "@/components/merchant/MerchantLayout";
import { RotateCcw, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const ROWS_PER_PAGE = 20;

function fmtMoneyTRY(n) {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(n) || 0);
  } catch {
    const v = Number(n) || 0;
    return `${v.toFixed(2)} ₺`;
  }
}
function fmtDT(iso, locale = "tr-TR") {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString(locale); } catch { return iso; }
}
function badgeCls(status) {
  const base = "px-2 py-1 rounded text-xs font-bold";
  if (status === "accepted") return `${base} bg-green-900/50 text-[#b3ffb3]`;
  if (status === "invalid_signature") return `${base} bg-red-900/50 text-red-300`;
  if (status === "unauthorized") return `${base} bg-red-900/50 text-red-300`;
  if (status === "replay") return `${base} bg-yellow-900/50 text-yellow-200`;
  if (status === "expired") return `${base} bg-orange-900/50 text-orange-200`;
  if (status === "error") return `${base} bg-gray-800 text-gray-200`;
  return `${base} bg-gray-700 text-gray-200`;
}

export default function MerchantPostLogsPage() {
  const t = useTranslation();
  const tt = (k, fb) => (t(k) === k ? (fb ?? k) : t(k)); // i18n fallback

  const [page, setPage] = useState(1);
  const [list, setList] = useState({ items: [], total: 0, page: 1, pageCount: 1 });
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [err, setErr] = useState("");

  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detail, setDetail] = useState(null);

  // fetch list
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    fetch(`/api/merchant_webhook_logs?page=${page}&limit=${ROWS_PER_PAGE}`, { credentials: "include" })
      .then(r => r.json())
      .then((data) => {
        if (!alive) return;
        if (!data || !Array.isArray(data.items)) {
          setErr(tt("postlogs.failedList", "Failed to load logs."));
          setList({ items: [], total: 0, page: 1, pageCount: 1 });
        } else {
          setList(data);
        }
      })
      .catch(() => {
        if (alive) setErr(tt("postlogs.failedList", "Failed to load logs."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [page, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const indexStart = useMemo(() => (page - 1) * ROWS_PER_PAGE, [page]);
  const pageCount = useMemo(() => Math.max(1, list.pageCount || 1), [list]);

  const doRefresh = () => setReloadKey(k => k + 1);

  async function openDetail(logId) {
    setShowDetail(true);
    setDetailLoading(true);
    setDetailErr("");
    setDetail(null);
    try {
      const res = await fetch(`/api/merchant_webhook_logs/${logId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setDetailErr(data.error || tt("postlogs.failedDetail", "Failed to load detail."));
      } else {
        setDetail(data);
      }
    } catch {
      setDetailErr(tt("postlogs.failedDetail", "Failed to load detail."));
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <MerchantLayout>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex flex-col">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#d1ffd0]">
            {tt("postlogs.title", "Sales Webhook Logs")}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {tt("postlogs.subtitle", "See every webhook POST received from your store. Click Details to view item lines (e.g. A / B / C) with quantity × unit price and accepted commissions.")}
          </p>
        </div>
        <button
          onClick={doRefresh}
          title={tt("postlogs.refresh", "Refresh")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-[#caffb6] hover:bg-[#222]"
          type="button"
        >
          <RotateCcw size={18} />
          <span className="hidden sm:inline">{tt("postlogs.refresh", "Refresh")}</span>
        </button>
      </div>

      <div className="rounded-xl overflow-x-auto bg-[#181818] border border-[#222] shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-[#baffc1] border-b border-[#222]">
              <th className="p-3 text-right w-16">#</th>
              <th className="p-3">{tt("postlogs.sentAt", "Sent At")}</th>
              <th className="p-3">{tt("postlogs.receivedAt", "Received At")}</th>
              <th className="p-3">{tt("postlogs.status", "Status")}</th>
              <th className="p-3 text-right">{tt("postlogs.orderTotalAccepted", "Order Total (accepted)")}</th>
              <th className="p-3 text-right">{tt("postlogs.totalCommission", "Total Commission")}</th>
              <th className="p-3 text-right w-28"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-400">
                  <Loader2 className="animate-spin inline-block mr-2" /> {tt("loading", "Loading...")}
                </td>
              </tr>
            )}
            {!loading && err && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-red-400">{err}</td>
              </tr>
            )}
            {!loading && !err && list.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-500">{tt("postlogs.noLogs", "No logs found.")}</td>
              </tr>
            )}
            {!loading && !err && list.items.map((row, i) => (
              <tr key={row.id} className="border-b border-[#222] hover:bg-[#1f231f] transition">
                <td className="p-3 text-right text-gray-300 font-mono">{indexStart + i + 1}</td>
                <td className="p-3">{fmtDT(row.sentAt || "", t.locale)}</td>
                <td className="p-3">{fmtDT(row.receivedAt || "", t.locale)}</td>
                <td className="p-3">
                  <span className={badgeCls(row.status)}>{row.status}</span>
                </td>
                <td className="p-3 text-right font-semibold text-[#81d742]">
                  {fmtMoneyTRY(row.totalAmountAccepted || 0)}
                </td>
                <td className="p-3 text-right font-semibold text-[#b3ffb3]">
                  {fmtMoneyTRY(row.totalCommission || 0)}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => openDetail(row.id)}
                    className="text-blue-400 hover:underline font-bold"
                    type="button"
                  >
                    {tt("details", "Details")}
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
            type="button"
          >
            {tt("prev", "Prev")}
          </button>
          <span className="font-semibold text-[#caffb6] text-base">
            {tt("page", "Page")} {page} / {pageCount}
          </span>
          <button
            className="px-3 py-1 rounded bg-[#232323] text-gray-300 hover:bg-[#222] transition disabled:opacity-40"
            disabled={page === pageCount}
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            type="button"
          >
            {tt("next", "Next")}
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[#181818] rounded-lg shadow-lg p-7 w-[760px] max-w-full relative border border-[#232323]">
            <button
              className="absolute right-4 top-3 text-gray-400 hover:text-red-400"
              onClick={() => setShowDetail(false)}
              aria-label={tt("close", "Close")}
              type="button"
            >
              <svg width="24" height="24"><path stroke="currentColor" strokeWidth="2" fill="none" d="M6 6L18 18M6 18L18 6"/></svg>
            </button>

            <h2 className="font-bold text-xl mb-1 text-[#d1ffd0] tracking-tight">{tt("postlogs.modalTitle", "Webhook Request Details")}</h2>
            {detail && (
              <div className="text-xs text-gray-400 mb-3">
                <div className="flex flex-wrap gap-4">
                  <span><b className="text-[#d1ffd0]">{tt("postlogs.requestId", "Request ID")}:</b> {detail.requestId}</span>
                  <span><b className="text-[#d1ffd0]">{tt("postlogs.nonce", "Nonce")}:</b> {detail.nonce}</span>
                  {detail.orderId && <span><b className="text-[#d1ffd0]">{tt("orderId", "Order ID")}:</b> {detail.orderId}</span>}
                  <span><b className="text-[#d1ffd0]">{tt("postlogs.sent", "Sent")}:</b> {fmtDT(detail.sentAt || "", t.locale)}</span>
                  <span><b className="text-[#d1ffd0]">{tt("postlogs.received", "Received")}:</b> {fmtDT(detail.receivedAt || "", t.locale)}</span>
                  <span>
                    <b className="text-[#d1ffd0]">{tt("status", "Status")}:</b>{" "}
                    <span className={badgeCls(detail.status)}>{detail.status}</span>
                  </span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl bg-[#202620] border border-[#243823] shadow-sm max-h-[360px]">
              <table className="min-w-full text-xs font-mono">
                <thead>
                  <tr className="text-[#baffc1] border-b border-[#243823]">
                    <th className="py-2 px-3 text-left">{tt("product", "Product")}</th>
                    <th className="py-2 px-3 text-left">{tt("postlogs.code", "Code")}</th>
                    <th className="py-2 px-3 text-right">{tt("quantity", "quantity")}</th>
                    <th className="py-2 px-3 text-right">{tt("postlogs.unit", "Unit")}</th>
                    <th className="py-2 px-3 text-right">{tt("postlogs.lineTotal", "Line Total")}</th>
                    <th className="py-2 px-3 text-right">{tt("postlogs.accepted", "Accepted")}</th>
                    <th className="py-2 px-3 text-right">{tt("commission", "Commission")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLoading && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-400">
                        <Loader2 className="animate-spin inline-block mr-2" /> {tt("loading", "Loading...")}
                      </td>
                    </tr>
                  )}
                  {!detailLoading && detailErr && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-red-400">{detailErr}</td>
                    </tr>
                  )}
                  {!detailLoading && !detailErr && (!detail || detail.items.length === 0) && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-500">{tt("postlogs.noItems", "No items.")}</td>
                    </tr>
                  )}
                  {!detailLoading && !detailErr && detail && detail.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-[#243823]">
                      <td className="py-2 px-3">{it.productName || "-"}</td>
                      <td className="py-2 px-3">{it.productCode}</td>
                      <td className="py-2 px-3 text-right">{it.quantity}</td>
                      <td className="py-2 px-3 text-right">{fmtMoneyTRY(it.unitPrice)}</td>
                      <td className="py-2 px-3 text-right">{fmtMoneyTRY(it.lineTotal)}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={it.accepted ? "text-[#b3ffb3] font-bold" : "text-gray-400"}>
                          {it.accepted ? tt("postlogs.yes", "Yes") : tt("postlogs.no", "No")}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">{it.accepted ? fmtMoneyTRY(it.commission || 0) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail && (
              <div className="mt-4 text-sm text-gray-300">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="text-[#d1ffd0] font-bold mr-2">{tt("postlogs.acceptedTotal", "Accepted Total")}:</span>
                    <span className="font-bold text-[#81d742]">{fmtMoneyTRY(detail.sums.acceptedTotal)}</span>
                  </div>
                  <div>
                    <span className="text-[#d1ffd0] font-bold mr-2">{tt("postlogs.acceptedCommission", "Total Commission")}:</span>
                    <span className="font-bold text-[#b3ffb3]">{fmtMoneyTRY(detail.sums.acceptedCommission)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                className="bg-[#232923] text-[#caffb6] px-7 py-2 rounded font-bold text-base border border-[#232] hover:bg-[#191f17] transition"
                onClick={() => setShowDetail(false)}
                type="button"
              >
                {tt("close", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </MerchantLayout>
  );
}
