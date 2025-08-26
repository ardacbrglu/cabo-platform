"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Layout from "@/components/Layout";
import CustomMultiSelect from "@/components/CustomMultiSelect";
import { BarChart2, ShoppingCart, Download, CalendarRange, TrendingUp, Activity, Trophy } from "lucide-react";
import useTranslation from "@/hooks/useTranslation";
import { useUser } from "@/context/UserContext";
import apiFetch from "@/lib/apiFetch";

// chart.js
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);
const Line = dynamic(() => import("react-chartjs-2").then((m) => m.Line), { ssr: false });

const COLOR_GREEN = "#81d742";
const COLOR_ACCENT = "#d1ffd0";

const RANGES = [
  { k: "7d", days: 7, key: "performance.range_7d" },
  { k: "30d", days: 30, key: "performance.range_30d" },
  { k: "90d", days: 90, key: "performance.range_90d" },
  { k: "all", days: null, key: "performance.range_all_time" },
];

function ymd(d) { return d.toISOString().slice(0, 10); }
function subDays(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }
function getCurrencySymbol(code = "TRY") {
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  if (code === "TRY") return "₺";
  return "₺";
}

export default function PerformancePage() {
  const { t } = useTranslation();
  const { user } = useUser();
  const currencySign = getCurrencySymbol(user?.currencyCode || "TRY");

  // filters
  const [range, setRange] = useState("7d");
  const [startDate, setStartDate] = useState(ymd(subDays(6)));
  const [endDate, setEndDate] = useState(ymd(new Date()));
  const [productIds, setProductIds] = useState([0]); // 0 -> All

  // data
  const [productOptions, setProductOptions] = useState([]);
  const [totals, setTotals] = useState({ clicks: 0, sales: 0, confirmedSales: 0, earnings: 0, revenue: 0, cr: 0 });
  const [daily, setDaily] = useState([]);
  const [perProduct, setPerProduct] = useState([]);
  const [confirmed, setConfirmed] = useState([]);
  const [loading, setLoading] = useState(true);

  const lastKey = useRef("");
  const abortRef = useRef(null);

  // quick ranges
  useEffect(() => {
    const r = RANGES.find((x) => x.k === range);
    if (!r) return;
    if (r.k === "all") { setStartDate(""); setEndDate(""); }
    else { setStartDate(ymd(subDays(r.days - 1))); setEndDate(ymd(new Date())); }
  }, [range]);

  // fetcher
  useEffect(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (productIds?.length) params.set("productIds", productIds.join(","));
    const key = params.toString();
    if (key === lastKey.current) return;

    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      lastKey.current = key;
      setLoading(true);
      const res = await apiFetch(`/api/performance?${key}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) { setLoading(false); lastKey.current = ""; return; }
      const data = await res.json();

      setProductOptions([{ value: 0, label: t("performance.all_products") }]
        .concat((data.products || []).map((p) => ({ value: p.productId, label: p.name }))));

      setTotals(data.totals || { clicks: 0, sales: 0, confirmedSales: 0, earnings: 0, revenue: 0, cr: 0 });
      setDaily(data.daily || []);
      setPerProduct(data.perProduct || []);
      setConfirmed(data.confirmedSales || []);
      setLoading(false);
    }, 160);

    return () => clearTimeout(timer);
  }, [startDate, endDate, productIds, t]);

  // chart
  const labels = useMemo(() => daily.map((d) => d.date), [daily]);
  const chartData = useMemo(() => ({
    labels,
    datasets: [
      {
        label: t("performance.chart_clicks") || "Clicks",
        data: daily.map((d) => d.clicks),
        borderColor: COLOR_GREEN,
        backgroundColor: "rgba(129,215,66,.14)",
        tension: 0.35,
        borderWidth: 2.5,
        fill: true,
        pointRadius: 2.5,
      },
      {
        label: t("performance.chart_sales") || "Sales",
        data: daily.map((d) => d.sales),
        borderColor: COLOR_ACCENT,
        backgroundColor: "rgba(209,255,208,.10)",
        tension: 0.35,
        borderWidth: 2.2,
        fill: true,
        pointRadius: 2.5,
      },
      {
        label: t("performance.chart_earnings") || "Earnings",
        data: daily.map((d) => d.earnings),
        yAxisID: "y1",
        borderColor: "#b0ffb0",
        backgroundColor: "rgba(176,255,176,.05)",
        tension: 0.3,
        borderDash: [6, 5],
        borderWidth: 2,
        fill: false,
        pointRadius: 2,
      },
    ],
  }), [labels, daily, t]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { labels: { color: "#c9eac7" } },
      tooltip: {
        backgroundColor: "#101410",
        borderColor: COLOR_GREEN,
        borderWidth: 1,
        titleColor: COLOR_GREEN,
        bodyColor: "#fff",
        displayColors: false,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            if (ctx.dataset.yAxisID === "y1")
              return `${ctx.dataset.label}: ${currencySign}${Number(ctx.formattedValue).toFixed(2)}`;
            return `${ctx.dataset.label}: ${ctx.formattedValue}`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: "#a8b3a8" }, grid: { color: "#262b26", borderDash: [2, 8] } },
      y: { ticks: { color: "#a8b3a8" }, grid: { color: "#262b26", borderDash: [2, 8] }, beginAtZero: true },
      y1: {
        position: "right",
        ticks: { color: "#bfffbf", callback: (v) => `${currencySign}${v}` },
        grid: { drawOnChartArea: false },
        beginAtZero: true,
      },
    },
  }), [currencySign]);

  // CSV (confirmed list)
  const csv = useMemo(() => {
    const esc = (s) => {
      const v = String(s ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const rows = [
      ["date", "orderId", "product", "amount", "commission", "quantity", "status"].join(","),
      ...(confirmed || []).map((s) =>
        [s.date, s.orderId, s.productName, s.amount?.toFixed?.(2), s.commission?.toFixed?.(2), s.quantity, s.status]
          .map(esc)
          .join(",")
      ),
    ];
    return rows.join("\n");
  }, [confirmed]);

  function downloadCsv() {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `performance_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const selectedName = useMemo(() => {
    if (productIds.includes(0) || productIds.length === 0) return t("performance.all_products");
    const p = productOptions.find((x) => x.value === productIds[0]);
    return p?.label || t("performance.selected_product");
  }, [productIds, productOptions, t]);

  return (
    <Layout>
      <main className="mx-auto w-full max-w-7xl px-3 md:px-8 pt-8 md:pt-10 pb-10">
        {/* Title + quick ranges */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-7">
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#d1ffd0] tracking-wide">
            {t("performance.title") || "Performance"}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r.k}
                onClick={() => setRange(r.k)}
                className={`px-3 py-1.5 rounded-full border text-sm font-semibold transition ${
                  range === r.k
                    ? "bg-[#81d742] text-black border-[#81d742]"
                    : "bg-[#1d1d1d] text-[#d8d8d8] border-[#2a2a2a] hover:bg-[#232323]"
                }`}
              >
                {t(r.key)}
              </button>
            ))}
          </div>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-7">
          {/* LEFT FILTERS */}
          <aside className="xl:col-span-3">
            <div className="bg-[#151515] border border-[#252525] rounded-2xl p-4 space-y-5">
              <CustomMultiSelect
                label={t("performance.product")}
                options={productOptions}
                selected={productIds}
                setSelected={(arr) => setProductIds(arr?.length ? arr : [0])}
              />

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#81d742] font-bold">
                  <CalendarRange size={18} /> <span>{t("performance.range_label") || "Date Range"}</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs text-[#8aa88a] mb-1">{t("performance.start_date")}</label>
                    <input
                      type="date"
                      className="w-full bg-[#202020] border border-[#333] rounded px-3 py-2 text-white outline-none focus:border-[#81d742]"
                      value={startDate}
                      onChange={(e) => { setRange("custom"); setStartDate(e.target.value); }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8aa88a] mb-1">{t("performance.end_date")}</label>
                    <input
                      type="date"
                      className="w-full bg-[#202020] border border-[#333] rounded px-3 py-2 text-white outline-none focus:border-[#81d742]"
                      value={endDate}
                      onChange={(e) => { setRange("custom"); setEndDate(e.target.value); }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI cards (compact) */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-[#1b1b1b] rounded-xl border border-[#262626] p-3">
                  <div className="text-xs text-gray-400 flex items-center gap-1"><Activity size={14}/>{t("performance.totalClicks")}</div>
                  <div className="text-[#81d742] text-2xl font-extrabold">{totals.clicks}</div>
                </div>
                <div className="bg-[#1b1b1b] rounded-xl border border-[#262626] p-3">
                  <div className="text-xs text-gray-400 flex items-center gap-1"><ShoppingCart size={14}/>{t("performance.total_sales")}</div>
                  <div className="text-[#81d742] text-2xl font-extrabold">{totals.sales}</div>
                </div>
                <div className="bg-[#1b1b1b] rounded-xl border border-[#262626] p-3">
                  <div className="text-xs text-gray-400 flex items-center gap-1"><TrendingUp size={14}/>CR</div>
                  <div className="text-[#d1ffd0] text-2xl font-extrabold">{(totals.cr * 100).toFixed(2)}%</div>
                </div>
                <div className="bg-[#1b1b1b] rounded-xl border border-[#262626] p-3">
                  <div className="text-xs text-gray-400">{t("performance.total_earnings")}</div>
                  <div className="text-[#d1ffd0] text-2xl font-extrabold">{currencySign}{Number(totals.earnings||0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          </aside>

          {/* MIDDLE: CHART */}
          <section className="xl:col-span-6 space-y-6">
            <div className="bg-[#151515] border border-[#252525] rounded-2xl p-4 h-[420px]">
              <div className="text-[#d1ffd0] font-bold mb-2">{selectedName}</div>
              {labels.length === 0 ? (
                <div className="h-[360px] flex items-center justify-center text-gray-400">
                  {loading ? t("processing") || "Loading..." : t("performance.no_data")}
                </div>
              ) : (
                <div className="h-[360px]">
                  <Line data={chartData} options={chartOptions} />
                </div>
              )}
            </div>

            {/* LEADERBOARD by Earnings */}
            <div className="bg-[#151515] border border-[#252525] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3 text-[#d1ffd0] font-bold"><Trophy size={18}/> {t("performance.leaderboard") || "Top Products"}</div>
              {perProduct.length === 0 ? (
                <div className="h-[120px] flex items-center justify-center text-gray-400">{t("performance.no_data")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs font-mono">
                    <thead>
                      <tr className="text-gray-400 border-b border-[#232323]">
                        <th className="py-2 pr-2">{t("product")}</th>
                        <th className="py-2 px-2">{t("performance.totalClicks")}</th>
                        <th className="py-2 px-2">{t("performance.total_sales")}</th>
                        <th className="py-2 px-2">CR</th>
                        <th className="py-2 pl-2">{t("performance.total_earnings")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perProduct.map((p) => (
                        <tr key={p.productId} className="border-b border-[#232323] last:border-none">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-2 min-w-[180px]">
                              <img
                                src={p.imageUrl || "https://placehold.co/32x32?text=IMG"}
                                className="w-8 h-8 rounded bg-[#222] object-contain border border-[#2b2b2b]"
                                onError={(e) => (e.currentTarget.src = "https://placehold.co/32x32?text=IMG")}
                                alt=""
                              />
                              <span className="truncate">{p.name}</span>
                              {!p.isActive && <span className="ml-2 text-[10px] text-yellow-400 font-bold">INACTIVE</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2">{p.clicks}</td>
                          <td className="py-2 px-2">{p.sales}</td>
                          <td className="py-2 px-2">{(p.cr * 100).toFixed(2)}%</td>
                          <td className="py-2 pl-2 font-bold" style={{ color: COLOR_GREEN }}>
                            {currencySign}{Number(p.earnings||0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: CONFIRMED SALES */}
          <aside className="xl:col-span-3">
            <div className="bg-[#151515] border border-[#252525] rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#252525]">
                <div className="text-[#d1ffd0] font-bold">{t("performance.confirmed_sales")}</div>
                <button
                  onClick={downloadCsv}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#81d742] text-black font-semibold hover:bg-[#a7ff72]"
                  title={t("performance.export_csv")}
                >
                  <Download size={18} /> {t("performance.export_csv")}
                </button>
              </div>
              {confirmed.length === 0 ? (
                <div className="h-[500px] flex items-center justify-center text-gray-400">
                  {t("performance.no_sales")}
                </div>
              ) : (
                <ul className="max-h-[500px] overflow-y-auto divide-y divide-[#232323]">
                  {confirmed.map((s) => (
                    <li key={s.saleId} className="px-4 py-3 flex items-center gap-3">
                      <img
                        src={s.productImage || "https://placehold.co/48x48?text=IMG"}
                        alt=""
                        className="w-10 h-10 rounded bg-[#222] object-contain border border-[#2b2b2b]"
                        onError={(e) => (e.currentTarget.src = "https://placehold.co/48x48?text=IMG")}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-white font-semibold text-sm">{s.productName}</div>
                        <div className="text-xs text-gray-400">{s.date} • {t("quantity")}: {s.quantity}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[#97ffb1] font-extrabold">{currencySign}{Number(s.commission || 0).toFixed(2)}</div>
                        <div className="text-[10px] text-gray-400 uppercase">{s.status}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>

      <style jsx global>{`
        @media (max-width: 640px) {
          .grid.grid-cols-1.xl\\:grid-cols-12.gap-7 {
            gap: 18px !important;
          }
        }
      `}</style>
    </Layout>
  );
}
