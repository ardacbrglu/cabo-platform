'use client';
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Wallet2, BarChart2, Lock, Banknote, Loader2, CheckCircle, XCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { useTranslation } from '@/hooks/useTranslation';


const COLOR_CABO = '#d1ffd0';
const COLOR_GREEN = '#81d742';

function WalletProgress({ value, max }) {
  const percent = Math.min((value / max) * 100, 100);
  const radius = 46, stroke = 6, center = 60, circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <div className="relative w-[120px] h-[120px] flex items-center justify-center mb-2 select-none">
      <svg width={120} height={120} className="absolute left-0 top-0 z-0">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#232323" strokeWidth={stroke} />
        <circle cx={center} cy={center} r={radius} fill="none" stroke={COLOR_GREEN} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s" }} />
      </svg>
      <Wallet2 className="absolute"
        style={{
          color: COLOR_CABO,
          width: 56, height: 56,
          left: "50%", top: "50%",
          transform: "translate(-50%, -50%)"
        }} />
    </div>
  );
}

function exportToCSV(sales, date, t) {
  const header = `${t("orderId")},${t("product")},${t("amount")},${t("commission")},${t("quantity")},${t("date")}\n`;
  const rows = sales.map(s =>
    [s.order_id, s.product, s.amount, s.commission, s.quantity, s.converted_at].join(',')
  ).join('\n');
  const csv = header + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payout_details_${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function WalletPage() {
  const csrfToken = useCsrfToken();
  const t = useTranslation();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [pending, setPending] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [minPayout, setMinPayout] = useState(100);
  const [iban, setIban] = useState('');
  const [bankName, setBankName] = useState('');
  const [realName, setRealName] = useState('');
  const [ibanSaved, setIbanSaved] = useState(false);
  const [ibanError, setIbanError] = useState('');
  const [bankError, setBankError] = useState('');
  const [realNameError, setRealNameError] = useState('');
  const [history, setHistory] = useState([]);
  const [payoutState, setPayoutState] = useState({ status: '', message: '' });
  const [detailsModal, setDetailsModal] = useState({
    open: false, sales: [], total: 0, status: '', date: '', paid_at: null, rejected_reason: '', updated_at: null,
    bankName: '', iban: '', realName: '', platform_paid: false, platform_paid_at: null, page: 1, totalPages: 1, request_id: null,
  });
  const [ibanMissing, setIbanMissing] = useState(true);
  const [bankMissing, setBankMissing] = useState(true);
  const [realNameMissing, setRealNameMissing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); // double submit önleme

  // pending payout kontrol
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [pendingAmount, setPendingAmount] = useState(0);

  // Pagination
  const PAGE_SIZE = 4;
  const [page, setPage] = useState(1);

  const { user, setUser } = useUser();

  // Kullanıcıyı güncelle
  useEffect(() => {
    if (!user?.name) {
      fetch('/api/me')
        .then(res => res.json())
        .then(data => {
          if (data && data.name) {
            setUser(u => ({
              ...u,
              name: data.name,
              email: data.email,
              user_id: data.user_id,
              role: data.role,
            }));
          }
        });
    }
  }, [user, setUser]);

  // Ana veri çekme
  const refreshData = () => {
    setLoading(true);
    fetch('/api/wallet')
      .then(res => res.json())
      .then(data => {
        setBalance(data.balance || 0);
        setPending(data.pending || 0);
        setConfirmed(data.confirmed || 0);
        setMinPayout(data.minPayout || 100);
        setIban(data.iban || '');
        setBankName(data.bankName || '');
        setRealName(data.realName || '');
        setIbanMissing(data.ibanMissing);
        setBankMissing(data.bankMissing);
        setRealNameMissing(data.realNameMissing);
        setHistory(data.history || []);
        setHasPendingRequest(data.hasPendingRequest || false);
        setPendingAmount(data.pendingAmount || 0);
        setLoading(false);
      });
  };
  useEffect(() => { refreshData(); }, []);

  function validateIban(val) {
    return val.startsWith('TR') && val.length === 26;
  }
  function validateRealName(val) {
    return val && val.trim().split(' ').length >= 2 && val.trim().length >= 4;
  }

  function handleIbanSave(e) {
    e.preventDefault();
    setIbanError('');
    setBankError('');
    setRealNameError('');
    if (!validateIban(iban)) {
      setIbanError(t("invalidIban"));
      return;
    }
    if (!bankName.trim()) {
      setBankError(t("bankNameRequired"));
      return;
    }
    if (!validateRealName(realName)) {
      setRealNameError(t("realNameRequired"));
      return;
    }
    setIsSubmitting(true);
    fetch('/api/wallet', {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ iban, bankName, realName })
    }).then(async (res) => {
      setIsSubmitting(false);
      if (res.ok) {
        setIbanSaved(true);
        setTimeout(() => setIbanSaved(false), 2000);
      }
      refreshData();
    });
  }


  async function handleRequestPayout() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setPayoutState({ status: 'loading', message: '' });
    const res = await fetch('/api/wallet', {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ requestPayout: true })
    });
    setIsSubmitting(false);
    const data = await res.json();
    if (res.ok) {
      setPayoutState({ status: 'success', message: data.message || t("payoutRequested") });
      refreshData();
    } else {
      setPayoutState({ status: 'error', message: data.error || t("unknownError") });
    }
    setTimeout(() => setPayoutState({ status: '', message: '' }), 2500);
  }


  async function handleCancelRequest(request_id) {
    if (isSubmitting) return;
    if (!window.confirm(t("cancelPayoutConfirm"))) return;
    setIsSubmitting(true);
    setPayoutState({ status: 'loading', message: '' });
    const res = await fetch('/api/wallet', {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ cancelRequest: true, request_id })
    });
    setIsSubmitting(false);
    const data = await res.json();
    if (res.ok) {
      setPayoutState({ status: 'success', message: data.message || t("cancelled") });
      refreshData();
    } else {
      setPayoutState({ status: 'error', message: data.error || t("unknownError") });
    }
    setTimeout(() => setPayoutState({ status: '', message: '' }), 2500);
  }


  const fetchDetails = async (request_id, pageNum = 1) => {
    // 1) CSRF token hazır değilse fetch’e hiç kalkışmayalım
    if (!csrfToken) {
      console.warn("CSRF token henüz alınmadı, detayları çekilmiyor.");
      return;
    }

    try {
      const res = await fetch('/api/payout_request_details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ request_id, page: pageNum, pageSize: 10 })
      });

      // 2) HTTP kodunu kontrol edelim
      if (!res.ok) {
        const err = await res.json();
        console.error("Detay çekme hatası:", err);
        // isterseniz burada bir hata state’i set edebilirsiniz:
        // setPayoutState({ status: 'error', message: err.error || 'Detay yüklenemedi.' });
        return;
      }

      // 3) Başarılı gelirse veriyi state’e al
      const data = await res.json();
      setDetailsModal(modal => ({
        ...modal,
        ...data,
        open: true,
        page: pageNum,
        totalPages: data.totalPages || 1,
        request_id
      }));
    } catch (networkErr) {
      console.error("Network veya parse hatası:", networkErr);
      // burada da kullanıcıya göstermek üzere bir state set edebilirsiniz
    }
  };

  function openDetails(request_id) {
    // Burada da yine token kontrolü koyabilirsiniz
    if (!csrfToken) return;
    fetchDetails(request_id, 1);
  }

  function closeDetails() {
    setDetailsModal({ open: false, sales: [], total: 0, status: '', date: '', paid_at: null, rejected_reason: '', updated_at: null });
  }

  // Pagination
  const totalPages = Math.ceil((history.length || 1) / PAGE_SIZE);
  let paginatedHistory = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (paginatedHistory.length < PAGE_SIZE) {
    paginatedHistory = [
      ...paginatedHistory,
      ...Array(PAGE_SIZE - paginatedHistory.length).fill(null)
    ];
  }
  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(totalPages);
  }, [history, totalPages, page]);

  const payoutDisabled =
    loading ||
    confirmed < minPayout ||
    ibanMissing ||
    bankMissing ||
    realNameMissing ||
    isSubmitting;

  return (
    <Layout>
      <main className="flex flex-col items-center w-full max-w-5xl mx-auto flex-1 justify-center mt-5 gap-8 px-1 md:px-4">
        {/* Info Bar */}
        {!loading && (ibanMissing || bankMissing || realNameMissing) && (
          <div className="w-full max-w-2xl mx-auto bg-red-900/80 text-red-200 font-mono rounded-xl px-3 py-2 sm:px-6 sm:py-3 text-xs sm:text-sm text-center mb-3 border border-red-700 shadow animate-pulse">
            <b>{t("bankInfoMissing")}</b> {t("bankInfoExplain")} <br />
            <span className="text-xs">
              {ibanMissing && <>• {t("ibanMissing")}&nbsp;</>}
              {bankMissing && <>• {t("bankNameMissing")}&nbsp;</>}
              {realNameMissing && <>• {t("realNameMissing")}&nbsp;</>}
            </span>
            <br />
            <span className="text-yellow-200">
              {t("updateYourDetails")}
            </span>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-5 md:gap-8 w-full">
          {/* Wallet Balance Section */}
          <div className="bg-[#181818] rounded-xl shadow py-5 px-2 sm:py-7 sm:px-8 flex-1 flex flex-col items-center min-w-[240px]">
            <div className="font-extrabold text-xl sm:text-2xl mb-2 font-mono" style={{ color: COLOR_GREEN }}>{t("wallet")}</div>
            {loading
              ? <Loader2 className="animate-spin text-gray-400 my-7" size={44} />
              : <WalletProgress value={confirmed} max={minPayout} />}
            <div className="flex flex-col items-center mb-4">
              <span className="font-mono text-gray-400 text-xs">{t("confirmedBalance")}</span>
              <span className="text-xl sm:text-2xl font-extrabold font-mono" style={{ color: COLOR_CABO }}>
                ₺{confirmed.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400 font-mono mb-1">
                ({t("readyToWithdraw")})
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 justify-center font-mono text-xs mb-2">
              <span className="bg-[#222] rounded px-2 py-1 text-[#e3d67d] font-bold">{t("pending")}: ₺{pending.toFixed(2)}</span>
              <span className="bg-[#232323] rounded px-2 py-1 text-[#81d742]">{t("total")}: ₺{balance.toFixed(2)}</span>
            </div>
            <div className="mb-3 text-xs font-mono">
              <span style={{ color: "#81d742" }}>{t("minPayout")}:</span>
              <span className="font-bold" style={{ color: COLOR_GREEN }}> ₺{minPayout}</span>
            </div>
            <div className="mt-2 text-xs font-bold animate-pulse font-mono text-center"
              style={{ color: confirmed < minPayout ? "#e3d67d" : COLOR_GREEN }}>
              {confirmed < minPayout
                ? <>{t("earnMoreToPayout")} <span style={{ color: COLOR_CABO }}>{(minPayout - confirmed).toFixed(2)}₺</span></>
                : <>{t("eligibleForPayout")}</>
              }
            </div>

            <button
              className={`mt-4 w-full py-2 rounded font-bold font-mono text-[#181818] ${hasPendingRequest
                ? "bg-[#323232] text-yellow-400 cursor-not-allowed"
                : payoutDisabled
                  ? "bg-[#323232] text-gray-500 cursor-not-allowed"
                  : "bg-[#81d742] hover:bg-[#a9ff72] transition"} text-base mb-1`}
              style={{ fontSize: "1.05rem" }}
              disabled={payoutDisabled || hasPendingRequest}
              onClick={handleRequestPayout}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : hasPendingRequest ? (
                <span className="flex items-center justify-center gap-1">
                  <Lock size={17} className="mr-1" />
                  {/* EN: Pending payout exists */}
                  Zaten bekleyen ödeme talebiniz var
                </span>
              ) : payoutDisabled ? (
                <span className="flex items-center justify-center gap-1">
                  <Lock size={17} className="mr-1" /> {t("walletRequirements")}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1">
                  <Banknote size={18} className="mr-1" /> {t("requestPayout")}
                </span>
              )}
            </button>




            {hasPendingRequest && (
              <div className="mt-2 text-yellow-400 text-xs font-mono">
                {t("alreadyPendingPayout")} (₺{pendingAmount.toFixed(2)}).
              </div>
            )}
            {payoutState.status === "success" && (
              <div className="flex items-center gap-1 mt-2 text-green-400 text-xs font-bold font-mono">
                <CheckCircle size={16} /> {payoutState.message}
              </div>
            )}
            {payoutState.status === "error" && (
              <div className="flex items-center gap-1 mt-2 text-red-400 text-xs font-bold font-mono">
                <XCircle size={16} /> {payoutState.message}
              </div>
            )}
          </div>
          {/* IBAN / Bank Form */}
          <div className="bg-[#181818] rounded-xl shadow py-5 px-2 sm:py-7 sm:px-7 flex-1 flex flex-col items-center min-w-[240px]">
            <div className="font-extrabold text-lg sm:text-xl font-mono mb-3" style={{ color: COLOR_CABO }}>
              {t("paymentDetails")}
            </div>
            <form className="w-full" onSubmit={handleIbanSave}>
              <label className="block text-xs font-bold text-[#d1ffd0] font-mono mb-1">{t("iban")}</label>
              <input
                type="text"
                className={`bg-[#161616] border ${ibanError ? "border-red-500" : "border-[#222]"} rounded px-4 py-2 mb-1 text-white w-full outline-none text-sm font-mono`}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                value={iban}
                onChange={e => setIban(e.target.value.toUpperCase())}
                required
                maxLength={26}
                autoComplete="off"
                inputMode="text"
              />
              {ibanError && <div className="text-xs text-red-400 mb-1 font-mono">{ibanError}</div>}

              <label className="block text-xs font-bold text-[#d1ffd0] font-mono mb-1">{t("bankName")}</label>
              <input
                type="text"
                className={`bg-[#161616] border ${bankError ? "border-red-500" : "border-[#222]"} rounded px-4 py-2 mb-1 text-white w-full outline-none text-sm font-mono`}
                placeholder="Ziraat Bank, Garanti BBVA..."
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                required
                maxLength={32}
                autoComplete="off"
                inputMode="text"
              />
              {bankError && <div className="text-xs text-red-400 mb-1 font-mono">{bankError}</div>}

              <label className="block text-xs font-bold text-[#d1ffd0] font-mono mb-1">{t("fullRealName")}</label>
              <input
                type="text"
                className={`bg-[#161616] border ${realNameError ? "border-red-500" : "border-[#222]"} rounded px-4 py-2 mb-1 text-white w-full outline-none text-sm font-mono`}
                placeholder={t("yourLegalName")}
                value={realName}
                onChange={e => setRealName(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
                inputMode="text"
              />
              {realNameError && <div className="text-xs text-red-400 mb-1 font-mono">{realNameError}</div>}

              <button
                type="submit"
                className={`w-full py-2 rounded font-bold font-mono bg-[#81d742] hover:bg-[#a9ff72] text-[#181818] text-base transition mt-2 ${isSubmitting ? 'opacity-60 pointer-events-none' : ''}`}>
                {ibanSaved ? t("saved") : t("saveBankInfo")}
              </button>
            </form>
            <div className="mt-3 text-xs text-gray-400 font-mono text-center">
              {t("bankInfoNote")}
            </div>
          </div>
        </div>

        {/* Payout History Section */}
        <div className="bg-[#181818] rounded-xl shadow py-6 px-2 sm:px-8 w-full mt-4 max-h-[340px] overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="text-[#81d742]" size={19} />
            <span className="font-extrabold text-base font-mono" style={{ color: COLOR_CABO }}>{t("payoutHistory")}</span>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="min-w-full text-xs font-mono text-left">
              <thead>
                <tr className="text-gray-400 border-b border-[#232323]">
                  <th className="py-2 px-3">{t("date")}</th>
                  <th className="py-2 px-3">{t("amount")}</th>
                  <th className="py-2 px-3">{t("status")}</th>
                  <th className="py-2 px-3">{t("method")}</th>
                  <th className="py-2 px-3">{t("bank")}</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-500 py-4">{t("noPayoutsYet")}</td></tr>
                ) : paginatedHistory.map((item, i) =>
                  item ? (
                    <tr key={i} className="border-b border-[#202020] last:border-none">
                      <td className="py-2 px-3">{item.date}</td>
                      <td className="py-2 px-3 font-bold" style={{ color: COLOR_GREEN }}>₺{item.amount}</td>
                      <td className="py-2 px-3">
                        <span className={`font-bold px-2 py-1 rounded ${
                          item.status === "paid"
                            ? "bg-green-900/60 text-[#81d742]"
                            : item.status === "rejected"
                              ? "bg-red-900/60 text-red-400"
                              : "bg-yellow-800/60 text-yellow-300"}`}>
                          {t(item.status)}
                        </span>
                        {item.status === "paid" && item.paid_at && (
                          <span className="ml-1 text-green-400 font-mono text-xs">
                            ({new Date(item.paid_at).toLocaleDateString()})
                          </span>
                        )}
                        {item.status === "rejected" && item.rejected_reason && (
                          <span className="ml-1 text-red-400 font-mono text-xs">
                            ({item.rejected_reason})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">{item.method}</td>
                      <td className="py-2 px-3">{item.bankName || '-'}</td>
                      <td className="py-2 px-3 flex items-center gap-1">
                        {(item.status === "pending" && item.request_id) && (
                          <button
                            onClick={() => handleCancelRequest(item.request_id)}
                            disabled={isSubmitting}
                            className="text-red-500 hover:bg-red-900/30 rounded p-1 transition flex items-center gap-1 text-xs font-mono"
                          >
                            <X size={13} /> {t("cancel")}
                          </button>
                        )}
                        <button
                          onClick={() => openDetails(item.request_id)}
                          className="text-blue-400 hover:underline ml-1 text-xs font-mono"
                        >{t("details")}</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className="border-b border-[#202020] last:border-none">
                      <td className="py-2 px-3">&nbsp;</td>
                      <td className="py-2 px-3">&nbsp;</td>
                      <td className="py-2 px-3">&nbsp;</td>
                      <td className="py-2 px-3">&nbsp;</td>
                      <td className="py-2 px-3">&nbsp;</td>
                      <td className="py-2 px-3">&nbsp;</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="flex justify-center mt-4 gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="px-2 py-1 rounded bg-[#232323] text-gray-300 hover:bg-[#222] disabled:opacity-40"
              ><ChevronLeft size={16} /></button>
              <span className="text-sm font-mono text-[#d1ffd0] px-2">{t("page")} {page} / {totalPages || 1}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="px-2 py-1 rounded bg-[#232323] text-gray-300 hover:bg-[#222] disabled:opacity-40"
              ><ChevronRight size={16} /></button>
            </div>
          </div>
        </div>

        {/* Details Modal */}
        {detailsModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-[#181818] rounded-lg shadow-lg p-3 sm:p-6 w-full max-w-lg relative">
              <button className="absolute right-3 top-2 text-gray-400" onClick={closeDetails}><X size={18} /></button>
              <h2 className="font-bold mb-2 text-lg font-mono text-[#d1ffd0]">{t("payoutRequestDetails")}</h2>
              <div className="text-xs mb-3 font-mono text-gray-400">
                {t("date")}: <span>{detailsModal.date?.slice(0,10)}</span> &nbsp;
                {t("status")}: <span className="font-bold">{t(detailsModal.status)}</span> <br />
                {t("total")}: <span style={{color: COLOR_GREEN}}>₺{detailsModal.total.toFixed(2)}</span>
                {detailsModal.paid_at && <span> &middot; <span className="text-green-400">{t("paidAt")}: {new Date(detailsModal.paid_at).toLocaleDateString()}</span></span>}
                {detailsModal.rejected_reason && <span> &middot; <span className="text-red-400">{t("reason")}: {detailsModal.rejected_reason}</span></span>}
                {detailsModal.updated_at && <span> &middot; <span className="text-gray-300">{t("updatedAt")}: {new Date(detailsModal.updated_at).toLocaleDateString()}</span></span>}
                <br />
                {t("bankName")}: <span className="text-[#81d742]">{detailsModal.bankName || '-'}</span> &nbsp;
                {t("iban")}: <span className="text-[#81d742]">{detailsModal.iban || '-'}</span> &nbsp;
                {t("name")}: <span className="text-[#81d742]">{detailsModal.realName || '-'}</span>
                <br />
                {t("platformPaid")}: {detailsModal.platform_paid
                  ? <span className="text-green-400">✔</span>
                  : <span className="text-yellow-400">—</span>
                }
                {detailsModal.platform_paid_at &&
                  <span> {t("at")} {new Date(detailsModal.platform_paid_at).toLocaleDateString()}</span>
                }
              </div>
              <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                <table className="w-full text-xs mb-2 font-mono">
                  <thead>
                    <tr className="text-gray-400 border-b border-[#232323]">
                      <th>{t("orderId")}</th>
                      <th>{t("product")}</th>
                      <th>{t("amount")}</th>
                      <th>{t("commission")}</th>
                      <th>{t("quantity")}</th>
                      <th>{t("date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsModal.sales.map(sale => (
                      <tr key={sale.sale_id} className="border-b border-[#232323]">
                        <td>{sale.order_id}</td>
                        <td>{sale.product}</td>
                        <td>₺{sale.amount}</td>
                        <td style={{ color: COLOR_GREEN }}>₺{sale.commission}</td>
                        <td>{sale.quantity}</td>
                        <td>{sale.converted_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination Controls */}
              <div className="flex justify-between items-center mt-2">
                <button
                  onClick={() => fetchDetails(detailsModal.request_id, detailsModal.page - 1)}
                  disabled={detailsModal.page <= 1}
                  className="px-2 py-1 bg-[#232323] rounded disabled:opacity-40"
                >&lt; {t("prev")}</button>
                <span className="text-[#81d742] text-xs font-mono">{t("page")} {detailsModal.page} / {detailsModal.totalPages}</span>
                <button
                  onClick={() => fetchDetails(detailsModal.request_id, detailsModal.page + 1)}
                  disabled={detailsModal.page >= detailsModal.totalPages}
                  className="px-2 py-1 bg-[#232323] rounded disabled:opacity-40"
                >{t("next")} &gt;</button>
              </div>
              <button onClick={() => exportToCSV(detailsModal.sales, detailsModal.date, t)}
                className="mt-2 py-1 px-4 rounded bg-[#81d742] text-[#181818] font-bold text-xs font-mono hover:bg-[#a9ff72]">
                {t("exportToCsv")}
              </button>
            </div>
          </div>
        )}
      </main>
      <style jsx global>{`
        @media (max-width: 640px) {
          .flex.flex-col.md\\:flex-row.gap-5.md\\:gap-8.w-full {
            flex-direction: column !important;
            gap: 18px !important;
          }
          .bg-\\[\\#181818\\].rounded-xl.shadow.py-5.px-2.sm\\:py-7.sm\\:px-8.flex-1.flex.flex-col.items-center.min-w-\\[240px\\] {
            padding-left: 8px !important;
            padding-right: 8px !important;
            min-width: 0 !important;
          }
        }
      `}</style>
    </Layout>
  );
}
