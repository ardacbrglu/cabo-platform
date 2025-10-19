// @ts-nocheck
"use client";

/**
 * Cabo Performance — JSX (desktop & mobile)
 * - Paneller default KAPALI; açık/kapalı ve sıralama durumu localStorage'da saklanır
 * - Grafik alanı (desktop) sürükle-bırak ile yeniden boyutlanabilir; yükseklik kalıcı
 * - Mobil kartlar: ürün görseli ve ad büyütülmüş, platform komisyonu sol-altta silik
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import PropTypes from "prop-types";
import Layout from "@/components/Layout";
import apiFetch from "@/lib/apiFetch";
import useTranslation from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Calendar,
  RefreshCcw,
  BarChart2,
  CheckCircle2,
  MousePointerClick,
  TrendingUp,
  Info,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
} from "lucide-react";

/* ===== ayarlar ===== */
const SHOW_NET = false;

/* ===== theme ===== */
const COLOR_CABO = "#d1ffd0";
const COLOR_GREEN = "#81d742";
const COLOR_PANEL = "#181818";
const COLOR_BORDER = "#232323";
const KPI_BG = "#141414";

const CHART_MIN_H = 220;
const CHART_MAX_H = 520;

const ROWS_FIXED = 5;
const ROW_HEIGHT = 48;
const HEAD_FOOT_PAD = 56;

/* Varsayılan sıralama (üstten alta): Satışlar > Grafik > Tıklamalar */
const DEFAULT_ORDER = ["sales", "chart", "clicks"];

/* ===== helpers ===== */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const fmtMoney = (n) =>
  Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n || 0).toLocaleString("tr-TR");

function parseUserAgent(uaRaw) {
  const ua = String(uaRaw || "");
  const has = (s) => ua.toLowerCase().includes(String(s).toLowerCase());
  let os = "Other OS";
  if (has("windows nt")) os = "Windows";
  else if (has("mac os x") && !has("iphone") && !has("ipad")) os = "macOS";
  else if (has("android")) os = "Android";
  else if (has("iphone") || has("ipad") || has("ios")) os = "iOS";
  else if (has("linux")) os = "Linux";
  let browser = "Other";
  if (has("edg/")) browser = "Edge";
  else if (has("chrome") && !has("edg/") && !has("opr/") && !has("brave")) browser = "Chrome";
  else if (has("safari") && !has("chrome")) browser = "Safari";
  else if (has("firefox")) browser = "Firefox";
  let device = "Desktop";
  if (has("mobile")) device = "Mobile";
  if (has("tablet") || has("ipad")) device = "Tablet";
  return `${os} · ${browser} · ${device}`;
}

function splitDateTime(a, b) {
  if (a && b) return { date: a, time: b };
  const s = String(a || b || "");
  const [d = "", t = ""] = s.split(" ");
  return { date: d, time: t };
}

// platform komisyon yüzdesi (kayıttan türetme)
const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;
const pctText = (commission, platformFee) => {
  const c = Number(commission || 0);
  const p = Number(platformFee || 0);
  if (!c || c <= 0) return "—";
  return `${round2((p / c) * 100)}%`;
};

/* ===== diller ===== */
function useDict() {
  const { t } = useTranslation();
  const g = (k, f) => t(k) || f;
  return {
    title: g("performance.title", "Performance"),
    startDate: g("performance.start_date", "Start Date"),
    endDate: g("performance.end_date", "End Date"),
    product: g("performance.product", g("product", "Product")),
    refresh: g("postlogs.refresh", "Refresh"),
    clicks: g("performance.clicks", "Clicks"),
    sales: g("performance.sales", "Sales"),
    confirmedSales: g("performance.confirmed_sales", "Confirmed Sales"),
    earnings: g("performance.earnings", "Earnings"),
    netEarnings: g("netEarnings", "Net Earnings"),
    cr: g("performance.cr", "CR"),
    crHelp: g("crHelp", "CR = (confirmed / clicks)."),
    date: g("performance.date", g("date", "Date")),
    time: g("time", "Time"),
    amount: g("performance.amount", g("amount", "Amount")),
    commission: g("performance.commission", g("commission", "Commission")),
    platformFee: g("platformCommissionShort", "Platform komisyonu"),
    net: t("netPayable") || "Net ödenecek",
    netProfit: "Net kâr",
    qty: t("quantity") || g("performance.quantity", "Adet"),
    status: g("performance.status", "Status"),
    userAgentLabelShort: "UA",
    company: t("company") || "Şirket",
    all: g("performance.all_products", "All Products"),
    clicksTitle: g("performance.chart_clicks", "Clicks"),
    confirmedSalesTitle: g("performance.confirmed_sales", "Confirmed Sales"),
  };
}

/* ===== küçük inputlar ===== */
function DateInput({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2 w-full">
      <span className="text-xs text-gray-300 flex items-center gap-1">
        <Calendar size={14} />
        {label}
      </span>
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex-1 bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-2 text-gray-200"
      />
    </label>
  );
}
DateInput.propTypes = { value: PropTypes.string, onChange: PropTypes.func.isRequired, label: PropTypes.string.isRequired };

function ProductSelect({ products, value, onChange, label, allLabel }) {
  return (
    <label className="flex items-center gap-2 w-full">
      <span className="text-xs text-gray-300">{label}</span>
      <select
        className="flex-1 bg-[#121212] border border-[#2a2a2a] rounded-lg px-3 py-2 text-gray-200"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="all">{allLabel}</option>
        {products.map((p) => (
          <option key={String(p.productId)} value={String(p.productId)}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
ProductSelect.propTypes = {
  products: PropTypes.array.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  allLabel: PropTypes.string.isRequired,
};

function Kpi({ icon, label, value, sub }) {
  return (
    <div
      className="rounded-xl p-4 md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,.2)]"
      style={{ background: KPI_BG, border: `1px solid ${COLOR_BORDER}`, willChange: "transform" }}
    >
      <div className="text-[11px] uppercase tracking-wide text-gray-300 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-extrabold mt-1" style={{ color: COLOR_GREEN }}>
        {value}
      </div>
      {sub ? <div className="text-[11px] text-gray-400 mt-1">{sub}</div> : null}
    </div>
  );
}
Kpi.propTypes = { icon: PropTypes.node.isRequired, label: PropTypes.node.isRequired, value: PropTypes.node.isRequired, sub: PropTypes.node };

/* ===== collapsible ===== */
function Collapsible({ id, title, icon, open, onToggle, draggable, onDragStart, onDragOver, onDrop, children }) {
  return (
    <section
      data-id={id}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(e, id);
      }}
      onDrop={(e) => onDrop?.(e, id)}
      className="rounded-2xl border mb-3 md:mb-4 md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,.2)]"
      style={{ background: COLOR_PANEL, borderColor: COLOR_BORDER, willChange: "transform" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full relative flex items-center justify-between px-3 py-2 text-left hover:bg-[#1e1e1e] rounded-t-2xl"
        aria-expanded={open}
      >
        <span className="text-sm text-gray-300 inline-flex items-center gap-2 min-w-0">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 pointer-events-none text-gray-300 select-none">+</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <div
        style={{
          maxHeight: open ? 9999 : 0,
          transition: "max-height .22s ease",
          overflow: "hidden",
          borderTop: `1px solid ${COLOR_BORDER}`,
        }}
      >
        {open && <div className="p-3 overflow-x-hidden">{children}</div>}
      </div>
    </section>
  );
}
Collapsible.propTypes = {
  id: PropTypes.oneOf(["clicks", "chart", "sales"]).isRequired,
  title: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  draggable: PropTypes.bool,
  onDragStart: PropTypes.func,
  onDragOver: PropTypes.func,
  onDrop: PropTypes.func,
  children: PropTypes.node.isRequired,
};

/* ===== METRIC PILLS (Eksik olan bileşen eklendi) ===== */
function MetricPills({ value, onChange }) {
  const { t } = useTranslation();
  const items = [
    { key: "clicks", label: t("performance.chart_clicks") || "Clicks" },
    { key: "confirmed", label: t("performance.confirmed_sales") || "Confirmed" },
    { key: "net", label: t("netEarnings") || "Net" },
  ];
  return (
    <div className="flex items-center gap-2 mb-2">
      {items.map((it) => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`px-2.5 h-7 text-[12px] rounded-full border transition-colors ${
              active
                ? "bg-[#222] text-white border-[#333]"
                : "bg-[#1a1a1a] text-gray-300 border-[#2a2a2a] hover:bg-[#202020]"
            }`}
            aria-pressed={active}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
MetricPills.propTypes = {
  value: PropTypes.oneOf(["clicks", "confirmed", "net"]).isRequired,
  onChange: PropTypes.func.isRequired,
};

/* ===== chart (canvas) ===== */
function CanvasPerfChart({ daily, metric, height, enableResize, onResizeDrag, onResizeCommit }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const lastDragH = useRef(height);

  const safeDaily = useMemo(() => {
    if (Array.isArray(daily) && daily.length) return daily;
    const arr = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
      ).padStart(2, "0")}`;
      arr.push({ date, clicks: 0, confirmed: 0, net: 0 });
    }
    return arr;
  }, [daily]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const W = wrap.clientWidth;
    const H = height;
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padL = 46, padR = 12, padT = 10, padB = 24;

    const toTs = (s) => { const [Y, M, D] = s.split("-").map(Number); return Date.UTC(Y, M - 1, D); };
    const xs = safeDaily.map((r) => toTs(r.date));
    const minX = xs[0], maxX = xs[xs.length - 1];
    const xScale = (t) => (maxX === minX ? padL : padL + ((t - minX) / (maxX - minX)) * (W - padL - padR));

    const pickVal = (r) => (metric === "clicks" ? +r.clicks || 0 : metric === "confirmed" ? +r.confirmed || 0 : +r.net || 0);
    const values = safeDaily.map(pickVal);
    const maxY = Math.max(1, Math.max(...values));
    const yScale = (v) => { const innerH = H - padT - padB; return padT + innerH - (v / maxY) * innerH; };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#101010"; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#222"; ctx.lineWidth = 1; ctx.beginPath();
    const gridRows = 4, gridCols = 6;
    for (let i = 0; i <= gridRows; i++) { const y = padT + ((H - padT - padB) * i) / gridRows; ctx.moveTo(46, y); ctx.lineTo(W - padR, y); }
    for (let i = 0; i <= gridCols; i++) { const t = minX + ((maxX - minX) * i) / gridCols; const x = xScale(t); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); }
    ctx.stroke();

    ctx.fillStyle = "#9aa0a6";
    ctx.font = "11px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    for (let i = 0; i <= gridRows; i++) { const val = Math.round((maxY * (gridRows - i)) / gridRows); const y = padT + ((H - padT - padB) * i) / gridRows; const txt = metric === "net" ? `₺${fmtMoney(val)}` : String(val); ctx.fillText(txt, 6, y + 4); }
    const fmtDate = (ts) => new Date(ts).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
    for (let i = 0; i <= gridCols; i++) { const ts = minX + ((maxX - minX) * i) / gridCols; const x = xScale(ts); ctx.fillText(fmtDate(ts), x - 16, H - 6); }

    let stroke = "rgba(200,200,200,.85)", fill = "rgba(200,200,200,.10)";
    if (metric === "confirmed") { stroke = "#4da3ff"; fill = "rgba(77,163,255,.12)"; }
    else if (metric === "net") { stroke = "#81d742"; fill = "rgba(129,215,66,.12)"; }

    const pts = safeDaily.map((r) => ({ x: xScale(toTs(r.date)), y: yScale(pickVal(r)) }));
    ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    if (pts.length) {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pts[0].x, H - 24);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts[pts.length - 1].x, H - 24); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
  }, [daily, metric, height]);

  // Desktop'ta grafik yüksekliği için sürükleme tutamacı
  useEffect(() => {
    if (!enableResize) return;
    const bar = document.getElementById("chart-resize-handle");
    if (!bar) return;

    let startY = 0;
    let baseH = 0;
    let active = false;

    const setCursor = (on) => {
      try {
        document.body.style.userSelect = on ? "none" : "";
        document.body.style.cursor = on ? "ns-resize" : "";
      } catch {}
    };

    const down = (e) => {
      const pt = e.touches?.[0] || e;
      startY = pt.clientY || 0;
      baseH = height;
      lastDragH.current = height;
      active = true;
      setCursor(true);
      e.preventDefault?.();
    };
    const move = (e) => {
      if (!active) return;
      const pt = e.touches?.[0] || e;
      const y = pt.clientY || 0;
      const h = clamp(baseH + (y - startY), CHART_MIN_H, CHART_MAX_H);
      lastDragH.current = h;
      onResizeDrag?.(h);
    };
    const up = () => {
      if (!active) return;
      active = false;
      setCursor(false);
      onResizeCommit?.(lastDragH.current || height);
    };

    bar.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      bar.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [enableResize, height, onResizeDrag, onResizeCommit]);

  return (
    <>
      <div ref={wrapRef} style={{ width: "100%", height }}><canvas ref={canvasRef} /></div>
      <div
        id="chart-resize-handle"
        className={`w-full py-1 text-center text-[11px] text-gray-400 ${enableResize ? "" : "opacity-60"} select-none ${enableResize ? "cursor-ns-resize" : "cursor-not-allowed"}`}
        style={{ borderTop: `1px dashed ${COLOR_BORDER}` }}
        role="separator"
        aria-orientation="horizontal"
      >
        <svg className="mx-auto" width="14" height="14" viewBox="0 0 24 24"><path d="M12 3l-4 4h3v10H8l4 4 4-4h-3V7h3l-4-4z" fill="currentColor"/></svg>
      </div>
    </>
  );
}
CanvasPerfChart.propTypes = {
  daily: PropTypes.array.isRequired,
  metric: PropTypes.oneOf(["clicks", "confirmed", "net"]).isRequired,
  height: PropTypes.number.isRequired,
  enableResize: PropTypes.bool,
  onResizeDrag: PropTypes.func.isRequired,
  onResizeCommit: PropTypes.func.isRequired,
};

/* ===== pager ===== */
function Pager({ total, perPage, page, setPage }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / Math.max(1, perPage)));
  const cur = clamp(page, 1, totalPages);
  useEffect(() => { if (page !== cur) setPage(cur); /* eslint-disable-next-line */ }, [total, perPage]);
  const goPrev = () => setPage(clamp(cur - 1, 1, totalPages));
  const goNext = () => setPage(clamp(cur + 1, 1, totalPages));
  const near = []; const from = Math.max(1, cur - 2); const to = Math.min(totalPages, cur + 2); for (let i = from; i <= to; i++) near.push(i);
  return (
    <div className="flex flex-wrap items-center justify-between mt-2 gap-2">
      <div className="flex items-center gap-2">
        <button className="px-2 py-1 rounded bg-[#232323] text-gray-200 disabled:opacity-40" onClick={goPrev} disabled={cur <= 1} aria-label="Önceki sayfa">‹</button>
        <div className="flex items-center gap-1">
          {near.map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`px-2 py-1 rounded border ${n === cur ? "bg-[#2a2a2a] text-white border-[#333]" : "bg-[#1a1a1a] text-gray-300 border-[#2a2a2a]"}`}
              aria-current={n === cur ? "page" : undefined}
            >
              {n}
            </button>
          ))}
        </div>
        <button className="px-2 py-1 rounded bg-[#232323] text-gray-200 disabled:opacity-40" onClick={goNext} disabled={cur >= totalPages} aria-label="Sonraki sayfa">›</button>
      </div>
      <span className="text-xs text-gray-300">Sayfa {cur} / {totalPages} • {total} kayıt</span>
    </div>
  );
}
Pager.propTypes = { total: PropTypes.number.isRequired, perPage: PropTypes.number.isRequired, page: PropTypes.number.isRequired, setPage: PropTypes.func.isRequired };

/* ===== desktop table ===== */
function FixedPagedTable({ rows, total, page, setPage, columns, renderRow }) {
  const rowsPerPage = ROWS_FIXED;
  const boxHeight = HEAD_FOOT_PAD + rowsPerPage * ROW_HEIGHT;
  return (
    <>
      <div className="overflow-hidden" style={{ height: boxHeight }}>
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="text-gray-400 text-xs border-b" style={{ borderColor: COLOR_BORDER }}>
              {columns.map((c) => (
                <th key={c.key} className={`${c.className || "text-left py-2"} whitespace-nowrap`}>{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center text-gray-500 py-4">—</td></tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r?.saleId || r?.clickId || idx} className="border-b" style={{ borderColor: COLOR_BORDER, height: ROW_HEIGHT }}>
                  {renderRow(r, idx)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager total={total} perPage={rowsPerPage} page={page} setPage={setPage} />
    </>
  );
}
FixedPagedTable.propTypes = {
  rows: PropTypes.array.isRequired, total: PropTypes.number.isRequired, page: PropTypes.number.isRequired,
  setPage: PropTypes.func.isRequired, columns: PropTypes.array.isRequired, renderRow: PropTypes.func.isRequired,
};

/* ===== mobile lists ===== */
function MobileSalesList({ rows, total, page, setPage, dict }) {
  return (
    <>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-center text-gray-500 text-sm py-2">—</li>
        ) : (
          rows.map((r, i) => {
            const { date, time } = splitDateTime(r.date, r.time);
            const fullDT = `${date}${time ? " " + time : ""}`;
            const pct = pctText(r.commission, r.platformFee);
            return (
              <li key={r?.saleId || i} className="rounded-lg border p-2 bg-[#121212]" style={{ borderColor: COLOR_BORDER }}>
                {/* üst satır: sol ürün + ikon, sağ tarih */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingCart size={16} className="opacity-80 text-gray-400 shrink-0" />
                    {r.productImage ? <img src={r.productImage} alt="" className="w-9 h-9 rounded object-cover border border-black/20 shrink-0" /> : null}
                    <div className="min-w-0">
                      <div className="text-[15px] leading-5 font-medium truncate">{r.productName}</div>
                      {r.company ? <div className="text-[12px] text-gray-400 truncate">{r.company}</div> : null}
                    </div>
                  </div>
                  <div className="truncate text-[12px] text-gray-400">
                    <span className="opacity-80">Tarih: </span>
                    <b className="text-gray-300">{fullDT}</b>
                  </div>
                </div>

                {/* tutar + adet + komisyon */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  <div>{dict.amount}: <b>₺{fmtMoney(r.amount)}</b></div>
                  <div>{dict.qty}: <b>{fmtInt(r.quantity)}</b></div>
                  <div>{dict.commission}: <b style={{ color: COLOR_GREEN }}>₺{fmtMoney(r.commission)}</b></div>
                </div>

                {/* alt satır: sol platform komisyonu (silik), sağ opsiyonel net */}
                <div className="mt-1 flex items-center justify-between text-[12px]">
                  <div className="truncate text-gray-500">
                    {dict.platformFee}: <b style={{ color: "rgba(227,214,125,.85)" }}>₺{fmtMoney(r.platformFee || 0)}</b>{" "}
                    <span className="opacity-70">({pct})</span>
                  </div>
                  {SHOW_NET ? (<div>{dict.netProfit}: <b style={{ color: COLOR_GREEN }}>₺{fmtMoney(r.net)}</b></div>) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
      <Pager total={total} perPage={ROWS_FIXED} page={page} setPage={setPage} />
    </>
  );
}
MobileSalesList.propTypes = { rows: PropTypes.array.isRequired, total: PropTypes.number.isRequired, page: PropTypes.number.isRequired, setPage: PropTypes.func.isRequired, dict: PropTypes.object.isRequired };

function MobileClicksList({ rows, total, page, setPage }) {
  return (
    <>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-center text-gray-500 text-sm py-2">—</li>
        ) : (
          rows.map((c, i) => {
            const { date, time } = splitDateTime(c.date, c.time);
            const fullDT = `${date}${time ? " " + time : ""}`;
            return (
              <li key={c?.clickId || i} className="rounded-lg border p-2 bg-[#121212]" style={{ borderColor: COLOR_BORDER }}>
                {/* üst satır: sol ikon + ürün (büyütülmüş), sağ tarih */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MousePointerClick size={16} className="opacity-80 text-gray-400 shrink-0" />
                    {c.productImage ? <img src={c.productImage} alt="" className="w-9 h-9 rounded object-cover border border-black/20 shrink-0" /> : null}
                    <div className="min-w-0">
                      <div className="text-[15px] leading-5 font-medium truncate">{c.productName}</div>
                      {c.company ? <div className="text-[12px] text-gray-400 truncate">{c.company}</div> : null}
                    </div>
                  </div>
                  <div className="truncate text-[12px] text-gray-400">
                    <span className="opacity-80">Tarih: </span>
                    <b className="text-gray-300">{fullDT}</b>
                  </div>
                </div>

                {/* cihaz bilgisi */}
                <div className="mt-1 text-[11px] text-gray-400 truncate">{parseUserAgent(c.userAgent)}</div>
              </li>
            );
          })
        )}
      </ul>
      <Pager total={total} perPage={ROWS_FIXED} page={page} setPage={setPage} />
    </>
  );
}
MobileClicksList.propTypes = { rows: PropTypes.array.isRequired, total: PropTypes.number.isRequired, page: PropTypes.number.isRequired, setPage: PropTypes.func.isRequired };

/* ===== main ===== */
export default function PerformancePage() {
  const dict = useDict();
  const isMobile = useIsMobile();

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [productId, setProductId] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [totals, setTotals] = useState({ clicks: 0, sales: 0, confirmedSales: 0, earnings: 0, netEarnings: 0, cr: 0 });
  const [daily, setDaily] = useState([]);

  const [salesTotal, setSalesTotal] = useState(0);
  const [salesRows, setSalesRows] = useState([]);
  const [salesPage, setSalesPage] = useState(1);

  const [clicksTotal, setClicksTotal] = useState(0);
  const [clickRows, setClickRows] = useState([]);
  const [clickPage, setClickPage] = useState(1);

  const [chartHeight, setChartHeight] = useState(CHART_MIN_H);
  const [chartMetric, setChartMetric] = useState("confirmed");

  // Paneller default KAPALI; open state kalıcı
  const [openClicks, setOpenClicks] = useState(false);
  const [openChart, setOpenChart] = useState(false);
  const [openSales, setOpenSales] = useState(false);

  // İlk render'da kalıcı ayarları yükle
  useEffect(() => {
    try {
      const rawOpen = localStorage.getItem("perf.panel.open");
      if (rawOpen) {
        const o = JSON.parse(rawOpen);
        setOpenSales(!!o?.sales);
        setOpenChart(!!o?.chart);
        setOpenClicks(!!o?.clicks);
      }
    } catch {}
    try {
      const rawOrder = localStorage.getItem("perf.panel.order");
      const arr = JSON.parse(rawOrder || "[]");
      const valid = Array.isArray(arr) && arr.length === 3 && ["sales","chart","clicks"].every((k) => arr.includes(k));
      if (valid) setPanelOrder(arr);
    } catch {}
    try {
      const v = Number(localStorage.getItem("perf.chart.h"));
      if (Number.isFinite(v)) setChartHeight(clamp(v, CHART_MIN_H, CHART_MAX_H));
    } catch {}
  }, []);

  // Açıklık değişince kalıcı kaydet
  useEffect(() => {
    try {
      localStorage.setItem("perf.panel.open", JSON.stringify({ sales: openSales, chart: openChart, clicks: openClicks }));
    } catch {}
  }, [openSales, openChart, openClicks]);

  // Panel sıralama (sürükle-bırak) + kalıcı
  const [panelOrder, setPanelOrder] = useState([...DEFAULT_ORDER]);
  useEffect(() => {
    try { localStorage.setItem("perf.panel.order", JSON.stringify(panelOrder)); } catch {}
  }, [panelOrder]);

  const dragId = useRef(null);
  const onDragStart = (e, id) => {
    if (isMobile) return;
    dragId.current = id;
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(id));
    } catch {}
  };
  const onDragOver = (e) => {
    if (isMobile) return;
    try { e.dataTransfer.dropEffect = "move"; } catch {}
  };
  const onDrop = (e, overId) => {
    if (isMobile) return;
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === overId) return;
    setPanelOrder((arr) => {
      const a = [...arr];
      const i = a.indexOf(from);
      const j = a.indexOf(overId);
      if (i === -1 || j === -1) return a;
      a.splice(j, 0, ...a.splice(i, 1));
      return a;
    });
  };

  // Grafik yükseklik kontrolü + kalıcı
  const handleChartDrag = useCallback((h) => setChartHeight(h), []);
  const handleChartCommit = useCallback((h) => {
    const v = clamp(h, CHART_MIN_H, CHART_MAX_H);
    setChartHeight(v);
    try { localStorage.setItem("perf.chart.h", String(v)); } catch {}
  }, []);

  // Query string (tarihler dahil)
  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    if (startDate) sp.set("startDate", startDate);
    if (endDate) sp.set("endDate", endDate);
    if (productId && productId !== "all") sp.set("productIds", String(productId));
    sp.set("page", String(salesPage)); sp.set("pageSize", "5");
    sp.set("clickPage", String(clickPage)); sp.set("clickPageSize", "5");
    return sp.toString();
  }, [startDate, endDate, productId, salesPage, clickPage]);

  const lastCtrl = useRef(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      try { lastCtrl.current?.abort(); } catch {}
      const ctrl = new AbortController(); lastCtrl.current = ctrl; const mySeq = ++seq.current;

      const res = await apiFetch(`/api/performance${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: { accept: "application/json", "cache-control": "no-cache", "X-Requested-With": "XMLHttpRequest" },
        cache: "no-store", credentials: "include", signal: ctrl.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (mySeq !== seq.current) return;

      if (!res.ok || !data?.ok) {
        setError(data?.error || "server_error");
      } else {
        setProducts(Array.isArray(data.products) ? data.products : []);
        setTotals(data.totals || {});
        setDaily(Array.isArray(data.daily) ? data.daily : []);
        setSalesTotal(data.confirmedSales?.total || 0);
        setSalesRows(Array.isArray(data.confirmedSales?.rows) ? data.confirmedSales.rows : []);
        setClicksTotal(data.clicks?.total || 0);
        setClickRows(Array.isArray(data.clicks?.rows) ? data.clicks.rows : []);

        const sPages = Math.max(1, Math.ceil((data.confirmedSales?.total || 0) / 5)); if (salesPage > sPages) setSalesPage(sPages);
        const cPages = Math.max(1, Math.ceil((data.clicks?.total || 0) / 5)); if (clickPage > cPages) setClickPage(cPages);
      }
    } catch (e) {
      if (e?.name !== "AbortError") setError("server_error");
    } finally {
      setLoading(false);
    }
  }, [qs, salesPage, clickPage]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [qs]);

  const renderPanel = (key) => {
    if (key === "chart") {
      return (
        <Collapsible
          id="chart"
          title="Grafik"
          icon={<BarChart2 size={16} />}
          open={openChart}
          onToggle={() => setOpenChart((v) => !v)}
          draggable={!isMobile}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <MetricPills value={chartMetric} onChange={setChartMetric} />
          <CanvasPerfChart
            daily={daily}
            metric={chartMetric}
            height={chartHeight}
            enableResize={!isMobile}
            onResizeDrag={handleChartDrag}
            onResizeCommit={handleChartCommit}
          />
        </Collapsible>
      );
    }
    if (key === "clicks") {
      return (
        <Collapsible
          id="clicks"
          title={dict.clicksTitle}
          icon={<MousePointerClick size={16} />}
          open={openClicks}
          onToggle={() => setOpenClicks((v) => !v)}
          draggable={!isMobile}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {isMobile ? (
            <MobileClicksList rows={clickRows} total={clicksTotal} page={clickPage} setPage={setClickPage} />
          ) : (
            <FixedPagedTable
              rows={clickRows}
              total={clicksTotal}
              page={clickPage}
              setPage={setClickPage}
              columns={[
                { key: "d",   title: dict.date,              className: "text-left py-2 w-[88px]" },
                { key: "t",   title: dict.time,              className: "text-left py-2 w-[82px]" },
                { key: "p",   title: dict.product,           className: "text-left py-2 w-[200px]" },
                { key: "m",   title: dict.company,           className: "text-left py-2 w-[150px] pl-0" },
                { key: "i",   title: "",                     className: "text-center py-2 w-[44px]" },
                { key: "ua",  title: dict.userAgentLabelShort, className: "text-left py-2 pl-0" },
              ]}
              renderRow={(c) => {
                const { date, time } = splitDateTime(c.date, c.time);
                return (
                  <>
                    <td className="py-2">{date}</td>
                    <td className="py-2">{time}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {c.productImage ? <img src={c.productImage} alt="" className="w-7 h-7 rounded object-cover border border-black/20" /> : null}
                        <span className="truncate block max-w-[180px]">{c.productName}</span>
                      </div>
                    </td>
                    <td className="py-2 pl-0 truncate">{c.company || "-"}</td>
                    <td className="py-2 text-center"><MousePointerClick size={16} className="inline-block opacity-80" /></td>
                    <td className="py-2 pl-0 truncate">{parseUserAgent(c.userAgent)}</td>
                  </>
                );
              }}
            />
          )}
        </Collapsible>
      );
    }
    if (key === "sales") {
      return (
        <Collapsible
          id="sales"
          title={dict.confirmedSalesTitle}
          icon={<ShoppingCart size={16} />}
          open={openSales}
          onToggle={() => setOpenSales((v) => !v)}
          draggable={!isMobile}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <div className="text-xs text-gray-400 mb-2">{fmtInt(salesTotal)} kayıt</div>

          {isMobile ? (
            <MobileSalesList rows={salesRows} total={salesTotal} page={salesPage} setPage={setSalesPage} dict={dict} />
          ) : (
            <FixedPagedTable
              rows={salesRows}
              total={salesTotal}
              page={salesPage}
              setPage={setSalesPage}
              columns={[
                { key: "d",   title: dict.date,        className: "text-left py-2 w-[88px]" },
                { key: "t",   title: dict.time,        className: "text-left py-2 w-[82px]" },
                { key: "p",   title: dict.product,     className: "text-left py-2 w-[200px]" },
                { key: "m",   title: dict.company,     className: "text-left py-2 w-[150px] pl-0" },
                { key: "qty", title: dict.qty,         className: "text-center py-2 w-[84px]" },
                { key: "a",   title: dict.amount,      className: "text-left py-2 w-[110px]" },
                { key: "c",   title: dict.commission,  className: "text-left py-2 w-[110px]" },
                { key: "pf",  title: dict.platformFee, className: "text-left py-2 w-[156px]" },
                ...(SHOW_NET ? [{ key: "n", title: dict.net, className: "text-left py-2 w-[140px]" }] : []),
              ]}
              renderRow={(r) => {
                const { date, time } = splitDateTime(r.date, r.time);
                const pct = pctText(r.commission, r.platformFee);
                return (
                  <>
                    <td className="py-2">{date}</td>
                    <td className="py-2">{time}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {r.productImage ? <img src={r.productImage} alt="" className="w-7 h-7 rounded object-cover border border-black/20" /> : null}
                        <span className="truncate block max-w-[180px]">{r.productName}</span>
                      </div>
                    </td>
                    <td className="py-2 pl-0 truncate">{r.company || "-"}</td>
                    <td className="py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <ShoppingCart size={16} className="opacity-80" />
                        <span className="px-1.5 leading-5 h-5 text-[11px] rounded bg-[#222] border border-[#333]">
                          {fmtInt(r.quantity)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2">₺{fmtMoney(r.amount)}</td>
                    <td className="py-2" style={{ color: COLOR_GREEN }}>₺{fmtMoney(r.commission)}</td>
                    <td className="py-2 text-[#e3d67d]">
                      <span className="text-gray-400 mr-1">({pct})</span>₺{fmtMoney(r.platformFee || 0)}
                    </td>
                    {SHOW_NET ? <td className="py-2 text-[#d1ffd0]">₺{fmtMoney(r.net)}</td> : null}
                  </>
                );
              }}
            />
          )}
        </Collapsible>
      );
    }
    return null;
  };

  const crFormatted = `${Number(totals.cr || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

  return (
    <Layout>
      <main className="w-full max-w-6xl mx-auto pt-3 pb-4 px-3 md:px-4 overflow-x-hidden">
        {/* filtreler */}
        <section
          className="rounded-2xl border mb-3 md:mb-4 md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,.2)]"
          style={{ background: COLOR_PANEL, borderColor: COLOR_BORDER, willChange: "transform" }}
        >
          <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3">
            <h1 className="text-lg md:text-xl font-extrabold truncate" style={{ color: COLOR_CABO }}>
              {dict.title}
            </h1>
            <button onClick={() => load()} className="inline-flex items-center gap-2 bg-[#1c1c1c] hover:bg-[#202020] border border-[#2a2a2a] rounded-lg px-3 py-2 text-gray-200">
              <RefreshCcw size={16} /> {dict.refresh}
            </button>
          </div>
          <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-6"} gap-3 px-3 pb-3 md:px-4 md:pb-4`}>
            <div className={isMobile ? "" : "col-span-2"}>
              <DateInput label={dict.startDate} value={startDate} onChange={(v) => { setStartDate(v); setSalesPage(1); setClickPage(1); }} />
            </div>
            <div className={isMobile ? "" : "col-span-2"}>
              <DateInput label={dict.endDate} value={endDate} onChange={(v) => { setEndDate(v); setSalesPage(1); setClickPage(1); }} />
            </div>
            <div className={isMobile ? "" : "col-span-2"}>
              <ProductSelect label={dict.product} allLabel={dict.all} products={products} value={productId} onChange={(v) => { setProductId(v); setSalesPage(1); setClickPage(1); }} />
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className={`grid ${isMobile ? "grid-cols-2" : "grid-cols-6"} gap-3 mb-3 md:mb-4`}>
          <Kpi icon={<MousePointerClick size={16} />} label={dict.clicks} value={fmtInt(totals.clicks)} />
          <Kpi icon={<BarChart2 size={16} />} label={dict.sales} value={fmtInt(totals.sales)} />
          <Kpi icon={<CheckCircle2 size={16} />} label={dict.confirmedSales} value={fmtInt(totals.confirmedSales)} />
          <Kpi icon={<TrendingUp size={16} />} label={dict.earnings} value={`₺${fmtMoney(totals.earnings)}`} />
          <Kpi icon={<TrendingUp size={16} />} label={dict.netEarnings} value={`₺${fmtMoney(totals.netEarnings)}`} />
          <Kpi
            icon={<TrendingUp size={16} />}
            label={<span className="inline-flex items-center gap-1">{dict.cr}<span className="text-gray-400" title={dict.crHelp}><Info size={12} /></span></span>}
            value={crFormatted}
            sub="(confirmed / clicks)"
          />
        </section>

        {/* paneller — sırayı panelOrder belirler, açık/kapalı kalıcı */}
        {panelOrder.map((k) => (<div key={k}>{renderPanel(k)}</div>))}

        {error && <div className="mt-3 text-center text-red-400 text-sm" role="alert" aria-live="polite">⚠ {error}</div>}
        {loading && <div className="mt-3 text-center text-gray-400 text-sm" aria-live="polite">Yükleniyor…</div>}
      </main>

      <style jsx>{`
        @media (min-width: 768px) {
          main { min-height: calc(100svh - var(--public-footer-h) - var(--header-h, 64px) - 20px); }
        }
        :global(body) { overscroll-behavior-x: none; }
      `}</style>
    </Layout>
  );
}
