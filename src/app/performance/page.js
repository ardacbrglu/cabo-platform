"use client";

/**
 * Cabo Performance — PROD (JavaScript)
 * - Panels default CLOSED
 * - Canvas chart (no deps), metric switch: Satış (confirmed) / Tıklama / Net ₺
 * - Mobile: stacked lists + pager (‹ › and "Sayfa X / Y"), no horizontal page shift
 * - Desktop: tables + pager, hover-lift cards
 * - Secure fetch (NextAuth-friendly): credentials: "include", X-Requested-With
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
  Download,
} from "lucide-react";

/* ========================== THEME / CONSTANTS ========================== */

const COLOR_CABO = "#d1ffd0";
const COLOR_GREEN = "#81d742";
const COLOR_PANEL = "#181818";
const COLOR_BORDER = "#232323";
const KPI_BG = "#141414";

const CHART_MIN_H = 220;
const CHART_MAX_H = 520;

const ROWS_FIXED = 5; // API pageSize sabit 5
const ROW_HEIGHT = 48;
const HEAD_FOOT_PAD = 56;

const DEFAULT_ORDER = ["chart", "clicks", "sales"];

/* ========================== HELPERS ==================================== */

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

function refHost(ref) {
  try {
    if (!ref) return "-";
    if (ref.includes("://")) return new URL(ref).host || ref;
    return ref.length > 80 ? ref.slice(0, 80) + "…" : ref;
  } catch {
    return "-";
  }
}

/** i18n sözlük */
function useDict() {
  const { t } = useTranslation();
  const g = (k, f) => t(k) || f;
  return {
    title: g("performance.title", g("performance", "Performans")),
    startDate: g("performance.start_date", "Başlangıç Tarihi"),
    endDate: g("performance.end_date", "Bitiş Tarihi"),
    product: g("performance.product", "Ürün"),
    refresh: g("postlogs.refresh", "Yenile"),
    clicks: g("performance.clicks", "Tıklama"),
    sales: g("performance.sales", "Satış"),
    confirmedSales: g("performance.confirmed_sales", "Onaylı Satışlar"),
    earnings: g("performance.earnings", "Kazanç"),
    netEarnings: g("netEarnings", "Net Kazanç"),
    cr: g("performance.cr", "CR"),
    crHelp: g("crHelp", "CR = (confirmed / clicks)."),
    date: g("performance.date", "Tarih"),
    amount: g("performance.amount", "Tutar"),
    commission: g("performance.commission", "Komisyon"),
    platformFee: g("platformCommissionShort", "Platform komisyonu"),
    net: g("netPayable", "Net ödenecek"),
    qty: g("quantity", "Adet"),
    status: g("performance.status", "Durum"),
    time: g("time", "Zaman"),
    referrer: g("referrer", "referrer"),
    userAgent: g("userAgent", "Cihaz"),
    all: g("performance.all_products", "Tüm Ürünler"),
    empty: g("performance.no_data", "Seçili filtre(ler) için veri yok."),
    clicksTitle: g("performance.chart_clicks", "Tıklama"),
    confirmedSalesTitle: g("performance.confirmed_sales", "Onaylı Satışlar"),
    csv: g("performance.export_csv", "CSV"),
  };
}

/* ======================= BASIC INPUTS ================================== */

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
DateInput.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};

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
          <option key={p.productId} value={String(p.productId)}>
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
Kpi.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.node.isRequired,
  value: PropTypes.node.isRequired,
  sub: PropTypes.node,
};

/* ====================== COLLAPSIBLE PANEL ============================== */

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
        {/* içerik: mobilde yatay taşma panel içinde kalsın */}
        {open && <div className="p-3 overflow-x-auto overscroll-x-contain">{children}</div>}
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

/* =========================== CANVAS CHART ============================== */

function CanvasPerfChart({ daily, metric, height, enableResize, onHeightDrag, onHeightCommit }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);
  const liveH = useRef(height);
  useEffect(() => {
    liveH.current = height;
  }, [height]);

  // 30 günlük boş seri
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
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const W = wrap.clientWidth;
    const H = height;
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // padding
    const padL = 46;
    const padR = 12;
    const padT = 10;
    const padB = 24;

    // x-scale
    const toTs = (s) => {
      const [Y, M, D] = s.split("-").map(Number);
      return Date.UTC(Y, M - 1, D);
    };
    const xs = safeDaily.map((r) => toTs(r.date));
    const minX = xs[0];
    const maxX = xs[xs.length - 1];
    const xScale = (t) => {
      if (maxX === minX) return padL;
      return padL + ((t - minX) / (maxX - minX)) * (W - padL - padR);
    };

    // y-scale
    const pickVal = (r) => {
      if (metric === "clicks") return Number(r.clicks || 0);
      if (metric === "confirmed") return Number(r.confirmed || 0);
      return Number(r.net || 0);
    };
    const values = safeDaily.map(pickVal);
    const maxY = Math.max(1, Math.max(...values));
    const yScale = (v) => {
      const innerH = H - padT - padB;
      return padT + innerH - (v / maxY) * innerH;
    };

    // clear
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridRows = 4;
    for (let i = 0; i <= gridRows; i++) {
      const y = padT + ((H - padT - padB) * i) / gridRows;
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
    }
    const gridCols = 6;
    for (let i = 0; i <= gridCols; i++) {
      const t = minX + ((maxX - minX) * i) / gridCols;
      const x = xScale(t);
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
    }
    ctx.stroke();

    // axis labels
    ctx.fillStyle = "#9aa0a6";
    ctx.font = "11px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    for (let i = 0; i <= gridRows; i++) {
      const val = Math.round((maxY * (gridRows - i)) / gridRows);
      const y = padT + ((H - padT - padB) * i) / gridRows;
      const txt = metric === "net" ? `₺${fmtMoney(val)}` : String(val);
      ctx.fillText(txt, 6, y + 4);
    }
    const fmtDate = (ts) => new Date(ts).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
    for (let i = 0; i <= gridCols; i++) {
      const ts = minX + ((maxX - minX) * i) / gridCols;
      const x = xScale(ts);
      ctx.fillText(fmtDate(ts), x - 16, H - 6);
    }

    // series color
    let stroke = "rgba(200,200,200,.85)";
    let fill = "rgba(200,200,200,.10)";
    if (metric === "confirmed") {
      stroke = "#4da3ff";
      fill = "rgba(77,163,255,.12)";
    } else if (metric === "net") {
      stroke = "#81d742";
      fill = "rgba(129,215,66,.12)";
    }

    // path
    const pts = safeDaily.map((r) => ({ x: xScale(toTs(r.date)), y: yScale(pickVal(r)) }));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    if (pts.length) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      // area
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, H - padB);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts[pts.length - 1].x, H - padB);
      ctx.closePath();
      ctx.fill();
    }

    // hover
    if (hoverX !== null) {
      let idx = 0;
      let bestDx = Infinity;
      for (let i = 0; i < xs.length; i++) {
        const dx = Math.abs(xScale(xs[i]) - hoverX);
        if (dx < bestDx) {
          bestDx = dx;
          idx = i;
        }
      }
      const x = xScale(xs[idx]);
      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();

      const dd = new Date(xs[idx]).toLocaleDateString("tr-TR");
      const val = pickVal(safeDaily[idx]);
      const label = metric === "confirmed" ? "Satış" : metric === "net" ? "Net" : "Tıklama";
      const valueStr = metric === "net" ? `₺${fmtMoney(val)}` : String(val);
      const tip = `${dd}  |  ${label}: ${valueStr}`;
      const tw = ctx.measureText(tip).width + 14;
      const th = 20;
      const tx = clamp(x - tw / 2, padL, W - padR - tw);
      const ty = padT + 6;
      ctx.fillStyle = "rgba(28,28,28,.95)";
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(tx, ty, tw, th);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#dfe6e9";
      ctx.fillText(tip, tx + 7, ty + 14);
    }
  }, [safeDaily, height, hoverX, metric]);

  // responsiveness
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      setHoverX((x) => (x === null ? null : x));
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // mouse
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onMove = (e) => {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setHoverX(x);
    };
    const onLeave = () => setHoverX(null);
    cv.addEventListener("mousemove", onMove);
    cv.addEventListener("mouseleave", onLeave);
    return () => {
      cv.removeEventListener("mousemove", onMove);
      cv.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // height resize grip — pointer events + live commit
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
      active = true;
      const pt = e.touches?.[0] || e;
      startY = pt.clientY || 0;
      baseH = liveH.current;
      setCursor(true);
      e.preventDefault();
    };

    const move = (e) => {
      if (!active) return;
      const pt = e.touches?.[0] || e;
      const y = pt.clientY || 0;
      const next = clamp(baseH + (y - startY), CHART_MIN_H, CHART_MAX_H);
      liveH.current = next;
      onHeightDrag(next);
    };

    const up = () => {
      if (!active) return;
      active = false;
      onHeightCommit(liveH.current);
      setCursor(false);
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
  }, [enableResize, onHeightDrag, onHeightCommit]);

  return (
    <>

      <div ref={wrapRef} style={{ width: "100%", height }}>
        <canvas ref={canvasRef} />
      </div>

      <div
        id="chart-resize-handle"
        className={`w-full py-1 text-center text-[11px] text-gray-400 ${enableResize ? "cursor-ns-resize" : "opacity-60 cursor-not-allowed"} select-none`}
        style={{ borderTop: `1px dashed ${COLOR_BORDER}` }}
        title={enableResize ? "Sürükleyerek grafik yüksekliğini ayarla" : "Mobilde sabit yükseklik"}
        role="separator"
        aria-orientation="horizontal"
      >
        <svg
          className="mx-auto"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 3l-4 4h3v10H8l4 4 4-4h-3V7h3l-4-4z" fill="currentColor"/>
        </svg>
      </div>


    </>
  );
}
CanvasPerfChart.propTypes = {
  daily: PropTypes.array.isRequired,
  metric: PropTypes.oneOf(["clicks", "confirmed", "net"]).isRequired,
  height: PropTypes.number.isRequired,
  enableResize: PropTypes.bool,
  onHeightDrag: PropTypes.func.isRequired,
  onHeightCommit: PropTypes.func.isRequired,
};

/* ============================ PAGER (‹ › + sağda sayfa) ================ */

function Pager({ total, perPage, page, setPage }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / Math.max(1, perPage)));
  const curPage = clamp(page, 1, totalPages);

  useEffect(() => {
    if (page !== curPage) setPage(curPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, perPage]);

  const goPrev = () => setPage(clamp(curPage - 1, 1, totalPages));
  const goNext = () => setPage(clamp(curPage + 1, 1, totalPages));

  return (
    <div className="flex items-center justify-between mt-2 gap-2">
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 rounded bg-[#232323] text-gray-200 disabled:opacity-40"
          onClick={goPrev}
          disabled={curPage <= 1}
          aria-label="Önceki sayfa"
        >
          ‹
        </button>
        <button
          className="px-2 py-1 rounded bg-[#232323] text-gray-200 disabled:opacity-40"
          onClick={goNext}
          disabled={curPage >= totalPages}
          aria-label="Sonraki sayfa"
        >
          ›
        </button>
      </div>
      <span className="text-xs text-gray-300">Sayfa {curPage} / {totalPages}</span>
    </div>
  );
}
Pager.propTypes = {
  total: PropTypes.number.isRequired,
  perPage: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  setPage: PropTypes.func.isRequired,
};

/* ========================= FIXED PAGED TABLE (DESKTOP) ================= */

function FixedPagedTable({ id, rows, total, page, setPage, columns, renderRow }) {
  const rowsPerPage = ROWS_FIXED;
  const boxHeight = HEAD_FOOT_PAD + rowsPerPage * ROW_HEIGHT;

  return (
    <>
      <div className="overflow-hidden" style={{ height: boxHeight }}>
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="text-gray-400 text-xs border-b" style={{ borderColor: COLOR_BORDER }}>
              {columns.map((c) => (
                <th key={c.key} className={c.className || "text-left py-2 truncate"}>
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-gray-500 py-4">
                  —
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={r?.saleId || r?.clickId || idx}
                  className="border-b"
                  style={{ borderColor: COLOR_BORDER, height: ROW_HEIGHT }}
                >
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
  id: PropTypes.string.isRequired,
  rows: PropTypes.array.isRequired,
  total: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  setPage: PropTypes.func.isRequired,
  columns: PropTypes.array.isRequired,
  renderRow: PropTypes.func.isRequired,
};

/* ========================= MOBILE STACKED LISTS ======================== */

function MobileSalesList({ rows, total, page, setPage }) {
  return (
    <>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-center text-gray-500 text-sm py-2">—</li>
        ) : (
          rows.map((r, i) => (
            <li
              key={r?.saleId || i}
              className="rounded-lg border p-2 bg-[#121212]"
              style={{ borderColor: COLOR_BORDER }}
            >
              <div className="text-xs text-gray-400 flex justify-between">
                <span>{r.date}</span>
                <span>{r.status}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {r.productImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.productImage} alt="" className="w-7 h-7 rounded object-cover border border-black/20" />
                ) : null}
                <div className="text-sm truncate">{r.productName}</div>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-[12px]">
                <div>Net: <b className="text-[#d1ffd0]">₺{fmtMoney(r.net)}</b></div>
                <div>Adet: <b>{fmtInt(r.quantity)}</b></div>
                <div>Tutar: <b>₺{fmtMoney(r.amount)}</b></div>
              </div>
            </li>
          ))
        )}
      </ul>

      <Pager total={total} perPage={ROWS_FIXED} page={page} setPage={setPage} />
    </>
  );
}
MobileSalesList.propTypes = {
  rows: PropTypes.array.isRequired,
  total: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  setPage: PropTypes.func.isRequired,
};

function MobileClicksList({ rows, total, page, setPage }) {
  return (
    <>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-center text-gray-500 text-sm py-2">—</li>
        ) : (
          rows.map((c, i) => (
            <li
              key={c?.clickId || i}
              className="rounded-lg border p-2 bg-[#121212]"
              style={{ borderColor: COLOR_BORDER }}
            >
              <div className="text-xs text-gray-400">{c.time}</div>
              <div className="text-sm truncate">{refHost(c.referrer)}</div>
              <div className="text-[11px] text-gray-400 truncate mt-0.5">{parseUserAgent(c.userAgent)}</div>
            </li>
          ))
        )}
      </ul>

      <Pager total={total} perPage={ROWS_FIXED} page={page} setPage={setPage} />
    </>
  );
}
MobileClicksList.propTypes = {
  rows: PropTypes.array.isRequired,
  total: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  setPage: PropTypes.func.isRequired,
};

/* ======================== METRIC PILL SWITCH ========================== */

function MetricPills({ value, onChange }) {
  const Item = ({ v, label }) => (
    <button
      onClick={() => onChange(v)}
      className={`px-2.5 py-1 text-[11px] rounded-md border ${
        value === v ? "bg-[#222] text-white border-[#333]" : "bg-[#1a1a1a] text-gray-300 border-[#2a2a2a]"
      }`}
      style={{ transition: "background .15s ease" }}
    >
      {label}
    </button>
  );
  Item.propTypes = { v: PropTypes.string, label: PropTypes.string };

  return (
    <div className="flex items-center gap-2 mb-2">
      <Item v="confirmed" label="Satış" />
      <Item v="clicks" label="Tıklama" />
      <Item v="net" label="Net Kazanç" />
    </div>
  );
}
MetricPills.propTypes = {
  value: PropTypes.oneOf(["clicks", "confirmed", "net"]).isRequired,
  onChange: PropTypes.func.isRequired,
};

/* ================================= MAIN ================================ */

export default function PerformancePage() {
  const dict = useDict();
  const isMobile = useIsMobile();

  // filtreler
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [productId, setProductId] = useState("all"); // "all" => tüm ürünler

  // data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [totals, setTotals] = useState({
    clicks: 0,
    sales: 0,
    confirmedSales: 0,
    earnings: 0,
    netEarnings: 0,
    cr: 0,
  });
  const [daily, setDaily] = useState([]);

  // Sales
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesRows, setSalesRows] = useState([]);
  const [salesPage, setSalesPage] = useState(1);

  // Clicks
  const [clicksTotal, setClicksTotal] = useState(0);
  const [clickRows, setClickRows] = useState([]);
  const [clickPage, setClickPage] = useState(1);

  // Chart
  const [chartHeight, setChartHeight] = useState(CHART_MIN_H);
  const [chartMetric, setChartMetric] = useState("confirmed");

  // collapsibles — HEPSİ KAPALI başlangıç
  const [openClicks, setOpenClicks] = useState(false);
  const [openChart, setOpenChart] = useState(false);
  const [openSales, setOpenSales] = useState(false);

  // DnD (mobilde kapalı)
  const [panelOrder, setPanelOrder] = useState([...DEFAULT_ORDER]);
  const dragId = useRef(null);
  const onDragStart = (_, id) => {
    if (isMobile) return;
    dragId.current = id;
  };
  const onDragOver = (e) => {
    if (isMobile) return;
    e.preventDefault();
  };
  const onDrop = (_, overId) => {
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

  // Grafik height persistence
  const handleChartDrag = useCallback((h) => setChartHeight(h), []);
  const handleChartCommit = useCallback((h) => {
    const v = clamp(h, CHART_MIN_H, CHART_MAX_H);
    setChartHeight(v);
    try {
      if (typeof window !== "undefined") localStorage.setItem("perf.chart.h", String(v));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const v = Number(localStorage.getItem("perf.chart.h"));
        if (Number.isFinite(v)) setChartHeight(clamp(v, CHART_MIN_H, CHART_MAX_H));
      }
    } catch {}
  }, []);

  // QueryString — desktop/mobil aynı (pageSize 5)
  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    if (startDate) sp.set("startDate", startDate);
    if (endDate) sp.set("endDate", endDate);
    if (productId && productId !== "all") sp.set("productIds", String(productId)); // "all" => göndermiyoruz
    sp.set("page", String(salesPage));
    sp.set("pageSize", "5");
    sp.set("clickPage", String(clickPage));
    sp.set("clickPageSize", "5");
    return sp.toString();
  }, [startDate, endDate, productId, salesPage, clickPage]);

  // Abortable & secure fetch (NextAuth-friendly)
  const lastCtrl = useRef(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      try {
        lastCtrl.current?.abort();
      } catch {}
      const ctrl = new AbortController();
      lastCtrl.current = ctrl;
      const mySeq = ++seq.current;

      const res = await apiFetch(`/api/performance${qs ? `?${qs}` : ""}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          "X-Requested-With": "XMLHttpRequest",
        },
        cache: "no-store",
        credentials: "include",
        signal: ctrl.signal,
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

        // sayfa clamp
        const sPages = Math.max(1, Math.ceil((data.confirmedSales?.total || 0) / 5));
        if (salesPage > sPages) setSalesPage(sPages);
        const cPages = Math.max(1, Math.ceil((data.clicks?.total || 0) / 5));
        if (clickPage > cPages) setClickPage(cPages);
      }
    } catch (e) {
      if (e?.name !== "AbortError") setError("server_error");
    } finally {
      setLoading(false);
    }
  }, [qs, salesPage, clickPage]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const KPIgrid = isMobile ? "grid-cols-2" : "grid-cols-6";

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
            onHeightDrag={handleChartDrag}
            onHeightCommit={handleChartCommit}
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
          {/* Mobil: kart list + sayfalama, Desktop: tablo + sayfalama */}
          {isMobile ? (
            <MobileClicksList rows={clickRows} total={clicksTotal} page={clickPage} setPage={setClickPage} />
          ) : (
            <div className="min-w-[720px]">
              <FixedPagedTable
                id="clicks"
                rows={clickRows}
                total={clicksTotal}
                page={clickPage}
                setPage={setClickPage}
                columns={[
                  { key: "t", title: dict.time, className: "text-left py-2 w-[140px]" },
                  { key: "pid", title: "productId", className: "text-left py-2 w-[100px]" },
                  { key: "ref", title: dict.referrer, className: "text-left py-2 w-[340px]" },
                  { key: "ua", title: dict.userAgent, className: "text-left py-2 w-[280px]" },
                ]}
                renderRow={(c) => (
                  <>
                    <td className="py-2 truncate">{c.time}</td>
                    <td className="py-2 truncate">{c.productId ?? "-"}</td>
                    <td className="py-2 truncate">{refHost(c.referrer)}</td>
                    <td className="py-2 truncate">{parseUserAgent(c.userAgent)}</td>
                  </>
                )}
              />
            </div>
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
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400">{fmtInt(salesTotal)} kayıt</div>
            {!isMobile && (
              <button
                onClick={() => {
                  const headers = ["date", "product", "amount", "commission", "platformFee", "net", "qty", "status"];
                  const lines = [headers.join(",")];
                  for (const r of salesRows) {
                    lines.push(
                      [
                        r.date,
                        `"${(r.productName || "").replace(/"/g, '""')}"`,
                        r.amount,
                        r.commission,
                        r.platformFee,
                        r.net,
                        r.quantity,
                        r.status,
                      ].join(",")
                    );
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "sales_page.csv";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1500);
                }}
                className="inline-flex items-center gap-1 bg-[#1c1c1c] hover:bg-[#222] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-gray-200"
                title="Görünen sayfayı CSV indir"
              >
                <Download size={14} />
                {dict.csv}
              </button>
            )}
          </div>

          {/* Mobil: kart list + sayfalama, Desktop: tablo + sayfalama */}
          {isMobile ? (
            <MobileSalesList rows={salesRows} total={salesTotal} page={salesPage} setPage={setSalesPage} />
          ) : (
            <div className="min-w-[920px]">
              <FixedPagedTable
                id="sales"
                rows={salesRows}
                total={salesTotal}
                page={salesPage}
                setPage={setSalesPage}
                columns={[
                  { key: "d", title: dict.date, className: "text-left py-2 w-[110px]" },
                  { key: "p", title: dict.product, className: "text-left py-2 w-[280px]" },
                  { key: "a", title: dict.amount, className: "text-right py-2 w-[120px]" },
                  { key: "c", title: dict.commission, className: "text-right py-2 w-[120px]" },
                  { key: "pf", title: dict.platformFee, className: "text-right py-2 w-[140px]" },
                  { key: "n", title: dict.net, className: "text-right py-2 w-[120px]" },
                  { key: "q", title: dict.qty, className: "text-right py-2 w-[80px]" },
                  { key: "s", title: dict.status, className: "text-right py-2 w-[100px]" },
                ]}
                renderRow={(r) => (
                  <>
                    <td className="py-2">{r.date}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {r.productImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.productImage} alt="" className="w-7 h-7 rounded object-cover border border-black/20" />
                        ) : null}
                        <span className="truncate block max-w-[240px]">{r.productName}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right">₺{fmtMoney(r.amount)}</td>
                    <td className="py-2 text-right" style={{ color: COLOR_GREEN }}>
                      ₺{fmtMoney(r.commission)}
                    </td>
                    <td className="py-2 text-right text-[#e3d67d]">₺{fmtMoney(r.platformFee || 0)}</td>
                    <td className="py-2 text-right text-[#d1ffd0]">₺{fmtMoney(r.net)}</td>
                    <td className="py-2 text-right">{fmtInt(r.quantity)}</td>
                    <td className="py-2 text-right">{r.status}</td>
                  </>
                )}
              />
            </div>
          )}
        </Collapsible>
      );
    }
    return null;
  };

  return (
    <Layout>
      <main className="w-full max-w-6xl mx-auto pt-3 pb-4 px-3 md:px-4 overflow-x-hidden">
        {/* Filtreler */}
        <section
          className="rounded-2xl border mb-3 md:mb-4 md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_30px_rgba(0,0,0,.2)]"
          style={{ background: COLOR_PANEL, borderColor: COLOR_BORDER, willChange: "transform" }}
        >
          <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3">
            <h1 className="text-lg md:text-xl font-extrabold truncate" style={{ color: COLOR_CABO }}>
              {dict.title}
            </h1>
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-2 bg-[#1c1c1c] hover:bg-[#202020] border border-[#2a2a2a] rounded-lg px-3 py-2 text-gray-200"
            >
              <RefreshCcw size={16} /> {dict.refresh}
            </button>
          </div>
          <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-6"} gap-3 px-3 pb-3 md:px-4 md:pb-4`}>
            <div className={isMobile ? "" : "col-span-2"}>
              <DateInput
                label={dict.startDate}
                value={startDate}
                onChange={(v) => {
                  setStartDate(v);
                  setSalesPage(1);
                  setClickPage(1);
                }}
              />
            </div>
            <div className={isMobile ? "" : "col-span-2"}>
              <DateInput
                label={dict.endDate}
                value={endDate}
                onChange={(v) => {
                  setEndDate(v);
                  setSalesPage(1);
                  setClickPage(1);
                }}
              />
            </div>
            <div className={isMobile ? "" : "col-span-2"}>
              <ProductSelect
                label={dict.product}
                allLabel={dict.all}
                products={products}
                value={productId}
                onChange={(v) => {
                  setProductId(v);
                  setSalesPage(1);
                  setClickPage(1);
                }}
              />
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className={`grid ${KPIgrid} gap-3 mb-3 md:mb-4`}>
          <Kpi icon={<MousePointerClick size={16} />} label={dict.clicks} value={fmtInt(totals.clicks)} />
          <Kpi icon={<BarChart2 size={16} />} label={dict.sales} value={fmtInt(totals.sales)} />
          <Kpi icon={<CheckCircle2 size={16} />} label={dict.confirmedSales} value={fmtInt(totals.confirmedSales)} />
          <Kpi icon={<TrendingUp size={16} />} label={dict.earnings} value={`₺${fmtMoney(totals.earnings)}`} />
          <Kpi icon={<TrendingUp size={16} />} label={dict.netEarnings} value={`₺${fmtMoney(totals.netEarnings)}`} />
          <Kpi
            icon={<TrendingUp size={16} />}
            label={
              <span className="inline-flex items-center gap-1">
                {dict.cr}
                <span className="text-gray-400" title={dict.crHelp}>
                  <Info size={12} />
                </span>
              </span>
            }
            value={fmtMoney(totals.cr)}
            sub="(confirmed / clicks)"
          />
        </section>

        {/* Paneller */}
        {panelOrder.map((k) => (
          <div key={k}>{renderPanel(k)}</div>
        ))}

        {error && (
          <div className="mt-3 text-center text-red-400 text-sm" role="alert" aria-live="polite">
            ⚠ {error}
          </div>
        )}
        {loading && (
          <div className="mt-3 text-center text-gray-400 text-sm" aria-live="polite">
            Yükleniyor…
          </div>
        )}
      </main>

      <style jsx>{`
        @media (min-width: 768px) {
          main {
            min-height: calc(100svh - var(--public-footer-h) - var(--header-h, 64px) - 20px);
          }
        }
        :global(body) {
          overscroll-behavior-x: none;
        }
      `}</style>
    </Layout>
  );
}
