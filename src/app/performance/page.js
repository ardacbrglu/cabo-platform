"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Layout from "@/components/Layout";
import CustomMultiSelect from "@/components/CustomMultiSelect";
import { BarChart2, ShoppingCart, Download, CalendarRange } from "lucide-react";
import useTranslation from "@/hooks/useTranslation";

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

// colors
const COLOR_GREEN = "#81d742";
const COLOR_ACCENT = "#d1ffd0";

// secure fetch (headers + dedup)
function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
async function apiFetch(url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-Requested-With", "XMLHttpRequest");
  headers.set("X-Request-Id", uuid());
  return fetch(url, { credentials: "include", ...init, headers });
}

const RANGES = [
  { k: "7d", days: 7, key: "performance.range_7d" },
  { k: "30d", days: 30, key: "performance.range_30d" },
  { k: "90d", days: 90, key: "performance.range_90d" },
  { k: "all", days: null, key: "performance.range_all_time" },
];

function ymd(d) { return d.toISOString().slice(0, 10); }
function subDays(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }

export default function PerformancePage() {
  const { t } = useTranslation();

  // filters
  const [range, setRange] = useState("7d");
  const [startDate, setStartDate] = useState(ymd(subDays(6)));
  const [endDate, setEndDate] = useState(ymd(new Date()));
  const [productIds, setProductIds] = useState([0]); // 0 → All

  // data
  const [products, setProducts] = useState([]);
  const [totals, setTotals] = useState({ clicks: 0, sales: 0, earnings: 0 });
  const [clickRecords, setClickRecords] = useState([]);
  const [saleRecords, setSaleRecords] = useState([]);
  const [confirmed, setConfirmed] = useState([]);

  const lastKey = useRef("");      // dedup
  const abortRef = useRef(null);   // abort inflight

  // quick range buttons control dates
  useEffect(() => {
    const r = RANGES.find((x) => x.k === range);
    if (!r) return;
    if (r.k === "all") { setStartDate(""); setEndDate(""); }
    else { setStartDate(ymd(subDays(r.days - 1))); setEndDate(ymd(new Date())); }
  }, [range]);

  // fetch performance (debounced)
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
      const res = await apiFetch(`/api/performance?${key}`, { signal: ac.signal });
      if (!res.ok) { lastKey.current = ""; return; }
      const data = await res.json();

      const opts = [{ value: 0, label: t("performance.all_products") }].concat(
        (data.products || []).map((p) => ({ value: p.productId, label: p.name }))
      );
      setProducts(opts);
      setTotals({
        clicks: data.totals?.clicks || 0,
        sales: data.totals?.sales || 0,
        earnings: Number(data.totals?.earnings || 0),
      });
      setClickRecords(data.clickRecords || []);
      setSaleRecords(data.saleRecords || []);
      setConfirmed(data.confirmedSales || []);
    }, 180);

    return () => clearTimeout(timer);
  }, [startDate, endDate, productIds, t]);

  // aggregate to chart series
  const series = useMemo(() => {
    const selected = productIds.includes(0) ? null : new Set(productIds);
    const map = new Map(); // date -> {clicks, sales}
    for (const c of clickRecords) {
      if (selected && !selected.has(c.productId)) continue;
      const d = c.date; const o = map.get(d) || { clicks: 0, sales: 0 }; o.clicks += 1; map.set(d, o);
    }
    for (const s of saleRecords) {
      if (selected && !selected.has(s.productId)) continue;
      const d = s.date; const o = map.get(d) || { clicks: 0, sales: 0 }; o.sales += (s.quantity || 1); map.set(d, o);
    }
    const labels = Array.from(map.keys()).sort();
    return { labels, clicks: labels.map((d) => map.get(d).clicks), sales: labels.map((d) => map.get(d).sales) };
  }, [clickRecords, saleRecords, productIds]);

  const chartData = useMemo(() => ({
    labels: series.labels,
    datasets: [
      { label: t("performance.chart_clicks"), data: series.clicks, borderColor: COLOR_GREEN, backgroundColor: "rgba(129,215,66,.12)", tension: .34, borderWidth: 2.5, fill: true, pointRadius: 3.5 },
      { label: t("performance.chart_sales"),  data: series.sales,  borderColor: COLOR_ACCENT, backgroundColor: "rgba(209,255,208,.10)", tension: .34, borderWidth: 2.5, fill: true, pointRadius: 3.5 },
    ],
  }), [series, t]);

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#c9eac7" } },
      tooltip: { backgroundColor: "#1b1f1b", borderColor: COLOR_GREEN, borderWidth: 1, titleColor: COLOR_GREEN, bodyColor: "#fff", displayColors: false, padding: 10 }
    },
    scales: {
      x: { ticks: { color: "#a8b3a8" }, grid: { color: "#262b26", borderDash: [2,8] } },
      y: { ticks: { color: "#a8b3a8" }, grid: { color: "#262b26", borderDash: [2,8] }, beginAtZero: true },
    }
  };

  // CSV (BOM ile Excel uyumlu)
  const csv = useMemo(() => {
    const rows = [
      [t("performance.date"), t("product"), t("amount"), t("commission"), t("quantity"), t("performance.status")],
      ...confirmed.map((s) => [
        s.date,
        (products.find((p) => p.value === s.productId)?.label || s.productName || "").replaceAll(",", " "),
        (s.amount ?? 0).toFixed(2),
        (s.commission ?? 0).toFixed(2),
        String(s.quantity ?? 1),
        s.status,
      ]),
    ];
    return rows.map((r) => r.join(",")).join("\n");
  }, [confirmed, products, t]);

  function downloadCsv() {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `performance_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const selectedName = useMemo(() => {
    if (productIds.includes(0) || productIds.length === 0) return t("performance.all_products");
    return products.find((p) => p.value === productIds[0])?.label || t("performance.selected_product");
  }, [productIds, products, t]);

  return (
    <Layout>
      {/* ÜSTTEN biraz daha aşağı – ortalanmış genişlik */}
      <main className="mx-auto w-full max-w-7xl px-4 md:px-8 pt-10 md:pt-12 pb-12">
        {/* Title + quick ranges */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-7">
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#d1ffd0] tracking-wide">
            {t("performance.title")}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* LEFT FILTERS */}
          <aside className="lg:col-span-3">
            <div className="bg-[#151515] border border-[#252525] rounded-2xl p-4 space-y-5">
              <CustomMultiSelect
                label={t("performance.product")}
                options={products}
                selected={productIds}
                setSelected={(arr) => setProductIds(arr?.length ? arr : [0])}
              />

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#81d742] font-bold">
                  <CalendarRange size={18} /> <span>{t("performance.range_label")}</span>
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
            </div>
          </aside>

          {/* MIDDLE: KPIs + CHART */}
          <section className="lg:col-span-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#1b1b1b] rounded-xl border border-[#262626] p-4 flex items-center gap-3">
                <BarChart2 color={COLOR_GREEN} />
                <div>
                  <div className="text-[#81d742] text-xl font-extrabold">{totals.clicks}</div>
                  <div className="text-xs text-gray-400">{t("performance.totalClicks")}</div>
                </div>
              </div>
              <div className="bg-[#1b1b1b] rounded-xl border border-[#262626] p-4 flex items-center gap-3">
                <ShoppingCart color={COLOR_GREEN} />
                <div>
                  <div className="text-[#81d742] text-xl font-extrabold">{totals.sales}</div>
                  <div className="text-xs text-gray-400">{t("performance.total_sales")}</div>
                </div>
              </div>
              <div className="bg-[#1b1b1b] rounded-xl border border-[#262626] p-4 flex items-center gap-3">
                <BarChart2 color={COLOR_ACCENT} />
                <div>
                  <div className="text-[#d1ffd0] text-xl font-extrabold">₺{Number(totals.earnings || 0).toFixed(2)}</div>
                  <div className="text-xs text-gray-400">{t("performance.total_earnings")}</div>
                </div>
              </div>
            </div>

            <div className="bg-[#151515] border border-[#252525] rounded-2xl p-4 h-[380px]">
              <div className="text-[#d1ffd0] font-bold mb-2">{selectedName}</div>
              {series.labels.length === 0 ? (
                <div className="h-[330px] flex items-center justify-center text-gray-400">{t("performance.no_data")}</div>
              ) : (
                <div className="h-[330px]"><Line data={chartData} options={chartOptions} /></div>
              )}
            </div>
          </section>

          {/* RIGHT: CONFIRMED SALES */}
          <aside className="lg:col-span-3">
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
                <div className="h-[420px] flex items-center justify-center text-gray-400">{t("performance.no_sales")}</div>
              ) : (
                <ul className="max-h-[420px] overflow-y-auto divide-y divide-[#232323]">
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
                        <div className="text-[#97ffb1] font-extrabold">₺{Number(s.commission || 0).toFixed(2)}</div>
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
    </Layout>
  );
}
