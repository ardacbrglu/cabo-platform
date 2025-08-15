"use client";

import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import CustomMultiSelect from "@/components/CustomMultiSelect";
import dynamic from "next/dynamic";
import { BarChart2, ShoppingCart, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation"; // ⬅️ default import + aşağıda destructure

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  Title,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, Title);
const Line = dynamic(() => import("react-chartjs-2").then((mod) => mod.Line), { ssr: false });

const COLOR_GREEN = "#81d742";
const COLOR_CABO = "#d1ffd0";
const SALES_PER_PAGE = 7;
const PLACEHOLDER_IMG = "https://placehold.co/80x80?text=IMG";

export default function PerformancePage() {
  const [stats, setStats] = useState({ totalClicks: 0, totalSales: 0, totalEarnings: 0 });
  const [filters, setFilters] = useState({ startDate: "", endDate: "", productIds: [0] });
  const [products, setProducts] = useState([]);
  const [clickRecords, setClickRecords] = useState([]);
  const [saleRecords, setSaleRecords] = useState([]);
  const [confirmedSales, setConfirmedSales] = useState([]);
  const [allConfirmedSales, setAllConfirmedSales] = useState([]);
  const [csvData, setCsvData] = useState("");
  const [selectedChart, setSelectedChart] = useState("clicks");
  const [salesPage, setSalesPage] = useState(1);

  const { user, setUser } = useUser();
  const { t } = useTranslation(); // ⬅️ doğru kullanım

  // User fetch (for locale)
  useEffect(() => {
    if (!user?.userId || !user?.name) {
      fetch("/api/me")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.userId) {
            setUser((u) => ({
              ...u,
              name: data.name,
              email: data.email,
              userId: data.userId,
              role: data.role,
            }));
          }
        });
    }
  }, [user, setUser]);

  // Performance data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.startDate) params.append("startDate", filters.startDate);
        if (filters.endDate) params.append("endDate", filters.endDate);
        if (filters.productIds.length > 0) params.append("productIds", filters.productIds.join(","));

        const res = await fetch(`/api/performance?${params.toString()}`);
        if (!res.ok) throw new Error("API error");
        const data = await res.json();

        setProducts(
          Array.isArray(data.products)
            ? data.products.map((p) => ({ value: p.productId, label: p.name }))
            : []
        );
        setStats({
          totalClicks: data.totalClicks || 0,
          totalSales: data.totalSales || 0,
          totalEarnings: data.totalEarnings || 0,
        });
        setClickRecords(data.clickRecords || []);
        setSaleRecords(data.saleRecords || []);
        setConfirmedSales(data.confirmedSales || []);
        setAllConfirmedSales(data.allConfirmedSales || data.confirmedSales || []);
        generateCsv(data.allConfirmedSales || data.confirmedSales || []);
        setSalesPage(1);
      } catch {
        setProducts([]);
        setStats({ totalClicks: 0, totalSales: 0, totalEarnings: 0 });
        setClickRecords([]);
        setSaleRecords([]);
        setConfirmedSales([]);
        setAllConfirmedSales([]);
        generateCsv([]);
        setSalesPage(1);
      }
    };
    fetchData();
  }, [filters]);

  const chartData = useMemo(() => {
    const selectedIds = filters.productIds.includes(0) || filters.productIds.length === 0 ? null : filters.productIds;
    const productFilter = (item) => !selectedIds || selectedIds.includes(item.productId);

    const dailyMap = {};
    saleRecords.filter(productFilter).forEach(({ date, quantity }) => {
      if (!dailyMap[date]) dailyMap[date] = { clicks: 0, sales: 0 };
      dailyMap[date].sales += Number(quantity || 1);
    });
    clickRecords.filter(productFilter).forEach(({ date }) => {
      if (!dailyMap[date]) dailyMap[date] = { clicks: 0, sales: 0 };
      dailyMap[date].clicks++;
    });

    const labels = Object.keys(dailyMap).sort();
    const dataPoints =
      selectedChart === "clicks"
        ? labels.map((d) => dailyMap[d]?.clicks || 0)
        : labels.map((d) => dailyMap[d]?.sales || 0);

    return {
      labels,
      datasets: [
        {
          label: selectedChart === "clicks" ? t("performance.chart_clicks") : t("performance.chart_sales"),
          data: dataPoints,
          borderColor: selectedChart === "clicks" ? COLOR_GREEN : COLOR_CABO,
          backgroundColor: selectedChart === "clicks" ? "rgba(129, 215, 66, 0.13)" : "rgba(209, 255, 208, 0.09)",
          borderWidth: 3,
          tension: 0.36,
          fill: true,
          pointRadius: 5,
          pointHoverRadius: 10,
          pointBackgroundColor: "#232323",
          pointBorderColor: selectedChart === "clicks" ? COLOR_GREEN : COLOR_CABO,
          pointBorderWidth: 2.3,
        },
      ],
    };
  }, [clickRecords, saleRecords, selectedChart, filters.productIds, t]);

  const pagedSales = useMemo(() => {
    const startIdx = (salesPage - 1) * SALES_PER_PAGE;
    return allConfirmedSales.slice(startIdx, startIdx + SALES_PER_PAGE);
  }, [allConfirmedSales, salesPage]);
  const totalPages = Math.max(1, Math.ceil(allConfirmedSales.length / SALES_PER_PAGE));

  const selectedProductName = useMemo(() => {
    if (filters.productIds.length === 0 || filters.productIds.includes(0)) return t("performance.all_products");
    if (filters.productIds.length === 1) {
      return products.find((p) => p.value === filters.productIds[0])?.label || t("performance.selected_product");
    }
    return t("performance.multiple_products");
  }, [filters.productIds, products, t]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: "#232823",
        borderColor: COLOR_GREEN,
        borderWidth: 1.3,
        titleColor: COLOR_GREEN,
        bodyColor: "#fff",
        padding: 12,
        caretSize: 7,
        displayColors: false,
        callbacks: {
          title: (tt) => tt[0]?.label,
          label: (tt) => `${tt.dataset.label}: ${tt.formattedValue}`,
        },
      },
    },
    layout: { padding: { left: 0, right: 0, top: 10, bottom: 10 } },
    scales: {
      x: {
        ticks: { display: false },
        grid: { color: "#262b26", borderDash: [2, 7], drawTicks: false },
      },
      y: {
        ticks: { color: COLOR_CABO, font: { size: 13, weight: 600 }, padding: 4 },
        grid: { color: "#262b26", borderDash: [2, 7], drawTicks: false },
        beginAtZero: true,
      },
    },
    animation: { duration: 900, easing: "easeOutCubic" },
  };

  function generateCsv(data) {
    const header = [
      t("performance.date"),
      t("performance.product"),
      t("performance.amount"),
      t("performance.commission"),
      t("performance.status"),
    ];
    const rows = data.map((r) => [
      r.date ?? "",
      r.productName ?? "",
      typeof r.amount === "number" ? r.amount.toFixed(2) : "0.00",
      typeof r.commission === "number" ? r.commission.toFixed(2) : "0.00",
      r.status ?? "",
    ]);
    setCsvData([header, ...rows].map((r) => r.join(",")).join("\n"));
  }
  function downloadCsv() {
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `performance_${user?.userId || "user"}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  const KPI_ICON_SIZE = 28;
  const SALES_ROW_HEIGHT = 54;
  const SALES_PANEL_BODY = SALES_ROW_HEIGHT * SALES_PER_PAGE + 12;

  return (
    <Layout>
      <main className="flex flex-col lg:flex-row gap-7 w-full max-w-7xl mx-auto py-7 px-2 md:px-5 font-mono min-h-[650px]">
        {/* SOL: ÜRÜN + TARİH FİLTRELERİ */}
        <aside className="w-full sm:w-[250px] flex-shrink-0 mb-6 lg:mb-0">
          <div className="bg-[#181818] rounded-2xl shadow-lg px-5 py-6 flex flex-col gap-7 h-full min-h-[265px]">
            <div>
              <label className="block mb-2 font-bold text-[17px] text-[#81d742]">{t("performance.product")}</label>
              <CustomMultiSelect
                options={products}
                selected={filters.productIds}
                setSelected={(arr) => {
                  if (arr.includes(0) && arr.length > 1) setFilters((f) => ({ ...f, productIds: [0] }));
                  else if (arr.length === 0) setFilters((f) => ({ ...f, productIds: [0] }));
                  else setFilters((f) => ({ ...f, productIds: arr }));
                }}
                label=""
              />
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block mb-1 font-bold text-[15px] text-[#81d742]">{t("performance.start_date")}</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                  className="p-2 rounded bg-[#222] border border-[#444] text-white outline-none focus:border-[#81d742] w-full text-sm"
                />
              </div>
              <div>
                <label className="block mb-1 font-bold text-[15px] text-[#81d742]">{t("performance.end_date")}</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                  className="p-2 rounded bg-[#222] border border-[#444] text-white outline-none focus:border-[#81d742] w-full text-sm"
                />
              </div>
            </div>
          </div>
        </aside>

        {/* ORTA: KPI + GRAFİK */}
        <section className="flex-1 min-w-[320px] flex flex-col gap-5">
          <div className="flex flex-row gap-3 justify-start mb-2 flex-wrap">
            <div className="bg-[#222] rounded-xl shadow flex flex-row items-center gap-3 px-6 py-3 min-w-[145px]">
              <BarChart2 size={KPI_ICON_SIZE} color={COLOR_GREEN} />
              <div>
                <div className="text-[#81d742] font-extrabold text-xl">{stats.totalClicks}</div>
                <div className="text-gray-400 uppercase text-xs tracking-wide">{t("performance.totalClicks")}</div>
              </div>
            </div>
            <div className="bg-[#222] rounded-xl shadow flex flex-row items-center gap-3 px-6 py-3 min-w-[145px]">
              <ShoppingCart size={KPI_ICON_SIZE} color={COLOR_GREEN} />
              <div>
                <div className="text-[#81d742] font-extrabold text-xl">{stats.totalSales}</div>
                <div className="text-gray-400 uppercase text-xs tracking-wide">{t("performance.total_sales")}</div>
              </div>
            </div>
            <div className="bg-[#222] rounded-xl shadow flex flex-row items-center gap-3 px-6 py-3 min-w-[145px]">
              <BarChart2 size={KPI_ICON_SIZE} color={COLOR_CABO} />
              <div>
                <div className="text-[#d1ffd0] font-extrabold text-xl">₺{stats.totalEarnings.toFixed(2)}</div>
                <div className="text-gray-400 uppercase text-xs tracking-wide">{t("performance.total_earnings")}</div>
              </div>
            </div>
          </div>

          <div className="bg-[#181818] rounded-2xl shadow-lg p-5 flex-1 flex flex-col h-full justify-between relative min-h-[320px]">
            <div className="flex flex-row items-center mb-4 gap-3">
              <div className="text-lg font-extrabold text-[#d1ffd0] tracking-wide flex-shrink-0">{selectedProductName}</div>
              <div className="flex flex-row gap-2 ml-auto">
                <button
                  onClick={() => setSelectedChart("clicks")}
                  className={`px-5 py-2 text-base rounded-full font-bold border transition ${
                    selectedChart === "clicks"
                      ? "bg-[#81d742] text-black border-[#81d742]"
                      : "bg-[#252625] text-[#ccc] border-[#2b2c2b] hover:bg-[#232723]"
                  }`}
                >
                  {t("performance.clicks")}
                </button>
                <button
                  onClick={() => setSelectedChart("sales")}
                  className={`px-5 py-2 text-base rounded-full font-bold border transition ${
                    selectedChart === "sales"
                      ? "bg-[#81d742] text-black border-[#81d742]"
                      : "bg-[#252625] text-[#ccc] border-[#2b2c2b] hover:bg-[#232723]"
                  }`}
                >
                  {t("performance.sales")}
                </button>
              </div>
            </div>
            <div className="w-full flex-1 flex items-end pb-1 min-h-[220px] relative">
              <Line data={chartData} options={chartOptions} height={280} />
              <style jsx global>{`
                .chartjs-render-monitor {
                  background: repeating-linear-gradient(
                      to right,
                      #1d201c 0,
                      #1d201c 1px,
                      transparent 1px,
                      transparent 42px
                    ),
                    repeating-linear-gradient(to bottom, #1d201c 0, #1d201c 1px, transparent 1px, transparent 38px);
                  border-radius: 18px;
                }
              `}</style>
            </div>
          </div>
        </section>

        {/* SAĞ: ONAYLI SATIŞLAR */}
        <aside className="w-full lg:w-[370px] flex flex-col">
          <div
            className="bg-[#181818] rounded-2xl shadow-lg flex-1 flex flex-col"
            style={{ border: "2px solid #232323", boxShadow: "0 0 6px #132e1248", overflow: "hidden", minHeight: 330 }}
          >
            <div className="text-2xl md:text-3xl font-bold text-[#d1ffd0] mb-2 mt-7 text-center font-sans">
              {t("performance.confirmed_sales")}
            </div>

            {allConfirmedSales.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-lg">{t("performance.no_sales")}</div>
            ) : (
              <ul className="flex-1 px-3 pt-3 overflow-y-auto" style={{ maxHeight: SALES_PANEL_BODY, minHeight: SALES_PANEL_BODY }}>
                {pagedSales.map((s, i) => {
                  const rowNum = allConfirmedSales.length - (salesPage - 1) * SALES_PER_PAGE - i;
                  return (
                    <li
                      key={s.saleId || s.date + "-" + i}
                      className="flex items-center gap-3 py-2 px-2 my-0.5 rounded-xl bg-[#222] hover:bg-[#232423] transition"
                      style={{ minHeight: 49, height: 49, maxHeight: 49 }}
                    >
                      <div className="text-[#81d742] font-bold text-base w-6 text-right flex-shrink-0">{rowNum}</div>
                      <img
                        src={s.productImage || PLACEHOLDER_IMG}
                        className="w-9 h-9 rounded bg-[#232323] border border-[#232c23] shadow flex-shrink-0 object-contain"
                        alt="Product"
                        onError={(e) => {
                          e.currentTarget.src = PLACEHOLDER_IMG;
                        }}
                      />
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="text-[15px] font-bold text-white truncate">{s.productName}</div>
                        <div className="text-xs text-gray-400">{s.date}</div>
                      </div>
                      <div className="flex flex-col items-end min-w-[64px] ml-1">
                        <span
                          className="rounded-[8px] font-bold"
                          style={{
                            color: "#97ffb1",
                            background: "#161e17",
                            border: "1.5px solid #18371e",
                            padding: "2.5px 14px 2.5px 12px",
                            fontFamily: "Fira Mono, monospace",
                            fontSize: 16,
                            minWidth: 52,
                            textAlign: "right",
                            boxShadow: "0 1px 8px #15291813",
                            letterSpacing: 1,
                          }}
                        >
                          ₺{s.commission.toFixed(2)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 pb-6 bg-[#181818] mt-auto">
              <div className="flex items-center gap-2">
                <button
                  className="p-1 rounded-full hover:bg-[#222] transition disabled:opacity-30"
                  disabled={salesPage === 1}
                  onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                  aria-label={t("performance.prev")}
                >
                  <ChevronLeft size={22} />
                </button>
                <span className="text-[#d1ffd0] font-bold text-lg tracking-wide select-none" style={{ minWidth: 48 }}>
                  {salesPage} / {totalPages}
                </span>
                <button
                  className="p-1 rounded-full hover:bg-[#222] transition disabled:opacity-30"
                  disabled={salesPage === totalPages}
                  onClick={() => setSalesPage((p) => Math.min(totalPages, p + 1))}
                  aria-label={t("performance.next")}
                >
                  <ChevronRight size={22} />
                </button>
              </div>
              <button
                onClick={downloadCsv}
                className="flex items-center justify-center gap-2 rounded bg-[#81d742] px-4 py-2 font-bold text-black text-base hover:bg-[#a9ff72] transition mt-2 sm:mt-0"
                title={t("performance.export_csv")}
                style={{ minWidth: 130 }}
              >
                <Download size={20} /> {t("performance.export_csv")}
              </button>
            </div>
          </div>
        </aside>
      </main>
    </Layout>
  );
}
