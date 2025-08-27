// app/dashboard/page.js
"use client";

/**
 * Dashboard (prod)
 * - Mobile sıra: [3 istatistik] → Canlı İşlem → Cüzdan → Son Aktiviteler → Liderlik → Hoş geldin
 * - Desktop:
 *   Row1: Live(8) + Leaderboard(4)
 *   Row2: Wallet(8, min-h bigger) + Right column (top Welcome, bottom Recent)
 * - Wallet ring: SVG, merkez tam, Cabo mint
 * - “Net ödenmiş” istatistiği: sum(PayoutRequest.netPayable WHERE status='paid')
 */

import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import apiFetch from "@/lib/apiFetch";
import {
  Link2,
  ShoppingCart,
  BarChart2,
  Trophy,
  Wallet2,
  Lock,
  Activity,
  ChevronRight,
} from "lucide-react";

const CABO = "#d1ffd0";
const GREEN = "#81d742";

/* ---------- atoms ---------- */
const Card = ({ className = "", title, icon, children }) => (
  <div
    className={`bg-[#181818] rounded-xl border border-[#222] shadow-sm ${className}
      transition-transform duration-150 hover:-translate-y-[2px] hover:shadow-[0_8px_30px_rgba(0,0,0,.25)]`}
    role="region"
  >
    {title ? (
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[#202020]">
        {icon}
        <h3 className="text-[#d1ffd0] font-mono font-extrabold text-[13px]">{title}</h3>
      </div>
    ) : null}
    {children}
  </div>
);

const Stat = ({ value, label, icon, className = "" }) => (
  <div
    className={`bg-[#181818] rounded-xl border border-[#222] h-[74px] flex items-center justify-center flex-col gap-[2px]
               transition-transform duration-150 hover:-translate-y-[2px] hover:shadow-[0_8px_30px_rgba(0,0,0,.25)] ${className}`}
  >
    <span className="text-white">{icon}</span>
    <span className="text-[15px] font-extrabold font-mono text-white leading-none">{value}</span>
    <span className="text-[11px] font-mono text-gray-400">{label}</span>
  </div>
);

/* Wallet ring */
function WalletRing({ value, max }) {
  const v = Math.max(0, Number(value || 0));
  const m = Math.max(0.0001, Number(max || 0));
  const pct = Math.min((v / m) * 100, 100);

  const SIZE = 144, R = 58, STROKE = 7, C = 2 * Math.PI * R;
  const offset = C * (1 - pct / 100);

  return (
    <div className="grid place-items-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="col-start-1 row-start-1" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#232323" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke={CABO} strokeWidth={STROKE}
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
      </svg>
      <Wallet2 className="col-start-1 row-start-1" size={52} color={CABO} />
    </div>
  );
}

/* Polling */
function useDashboardData(enabled) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, t = null;
    const ctrl = new AbortController();

    const run = async () => {
      try {
        const res = await apiFetch("/api/dashboard", { method: "GET", signal: ctrl.signal, cache: "no-store" });
        if (!alive) return;
        if (res.status === 401) { window.location.href = "/login"; return; }
        if (res.status === 403) { window.location.href = "/unauthorized"; return; }
        const j = await res.json().catch(() => null);
        if (alive && j) setData(j);
      } catch {}
      t = setTimeout(run, 15000);
    };
    run();

    const onVis = () => { if (document.visibilityState === "visible") { clearTimeout(t); t = setTimeout(run, 0); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearTimeout(t); ctrl.abort(); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled]);
  return data;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { ready, setUser } = useUser();
  const stats = useDashboardData(!!ready);

  // context bilgisi
  useEffect(() => {
    if (!stats) return;
    setUser((u) => ({
      ...(u || {}),
      name: stats.username || "",
      email: stats.email || "",
      userId: stats.userId || null,
      role: "affiliate",
    }));
  }, [stats, setUser]);

  // üst istatistikler
  const totalClicks = stats?.totalClicks || 0;
  const totalSales = stats?.totalSales || 0;
  const netPaid = stats?.netPaidTotal || 0; // yeni

  // cüzdan
  const confirmedAvailable = stats?.confirmedAvailable || 0;
  const minPayout = stats?.minPayout || 100;
  const platformCommission = stats?.platformCommission ?? 10;

  const eligible = !!stats?.payoutEligible;
  const disabledReason = stats?.payoutDisabledReason || (confirmedAvailable < minPayout ? "min" : null);
  const activeRequestCount = stats?.activeRequestCount || 0;

  const recentRows = Array.isArray(stats?.recentActions) ? stats.recentActions : [];
  const leaderboard = Array.isArray(stats?.leaderboard) ? stats.leaderboard : [];

  // durum metni
  const statusText = eligible
    ? t("eligibleForPayout")
    : disabledReason === "bank"
    ? t("walletRequirements")
    : disabledReason === "activeLimit"
    ? t("pendingPayoutExists")
    : t("earnMoreToPayout");

  const ctaLabel = eligible
    ? t("requestPayout")
    : disabledReason === "bank"
    ? t("walletRequirements")
    : disabledReason === "activeLimit"
    ? t("alreadyPendingPayout")
    : t("minThresholdNotMet");

  return (
    <Layout>
      {/* nav ile içerik arasında nefes + footer’a taşmadan sade padding */}
      <main className="w-full flex justify-center px-3 sm:px-4 py-5">
        <section className="w-full max-w-6xl">
          {/* Row 0 – 3 istatistik (mobilde yan yana) */}
          <div className="grid grid-cols-3 md:grid-cols-12 gap-3 md:gap-5">
            <div className="col-span-1 md:col-span-4 order-1">
              <Stat value={totalClicks} label={t("totalClicks")} icon={<Link2 size={18} />} />
            </div>
            <div className="col-span-1 md:col-span-4 order-2">
              <Stat value={totalSales} label={t("totalSales")} icon={<ShoppingCart size={18} />} />
            </div>
            <div className="col-span-1 md:col-span-4 order-3">
              <Stat
                value={`₺${Number(netPaid).toFixed(2)}`}
                label={t("netPaidTotal")} // <-- yeni anahtar
                icon={<BarChart2 size={18} />}
              />
            </div>

            {/* Row1 – Live + Leaderboard (desktop yan yana; mobil sırası: 4 ve 6) */}
            <div className="col-span-3 md:col-span-8 order-4 md:order-4">
              <Card title={t("liveStats")} icon={<Activity size={16} className="text-white" />}>
                <div className="px-4 py-3">
                  {stats?.lastConversion ? (
                    <div className="flex items-center justify-between rounded bg-[#191b19] px-3 py-2 font-mono text-[11px]">
                      <span className="font-bold text-[#81d742]">
                        {new Date(stats.lastConversion.time).toLocaleTimeString("tr-TR", {
                          hour12: false,
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span className="text-[#d1ffd0]">{stats.lastConversion.productName}</span>
                      <span className="font-bold text-[#81d742]">
                        ₺{Number(stats.lastConversion.commission || 0).toFixed(2)}
                      </span>
                      <span className="text-gray-400">x{stats.lastConversion.quantity || 1}</span>
                    </div>
                  ) : null}
                  {stats?.lastClick ? (
                    <div className="flex items-center justify-between rounded bg-[#232523] px-3 py-2 font-mono text-[11px] mt-2">
                      <span className="font-bold text-[#81d742]">
                        {new Date(stats.lastClick.time).toLocaleTimeString("tr-TR", {
                          hour12: false,
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span className="text-[#d1ffd0]">{stats.lastClick.productName}</span>
                      <span className="text-blue-400">Click</span>
                      <span className="text-gray-400">{stats.lastClick.extra || "-"}</span>
                    </div>
                  ) : null}
                  {!stats?.lastConversion && !stats?.lastClick && (
                    <div className="text-gray-400 text-[11px] font-mono">{t("noRecentActivity")}</div>
                  )}
                </div>
              </Card>
            </div>

            <div className="col-span-3 md:col-span-4 order-6 md:order-5">
              <Card title={t("leaderboard")} icon={<Trophy size={16} className="text-[#81d742]" />}>
                <div className="px-4 py-3">
                  {(leaderboard || []).map((row, i) => (
                    <div
                      key={`${row.name}-${i}`}
                      className="flex justify-between w-full text-[11px] px-1 font-mono py-[3px]"
                    >
                      <span className="font-bold" style={{ color: GREEN }}>
                        {i + 1}.
                      </span>
                      <span
                        className={row.name === stats?.username ? "font-bold" : ""}
                        style={{ color: row.name === stats?.username ? CABO : "#f6f6f6" }}
                      >
                        {row.name === stats?.username ? t("you") : row.name}
                      </span>
                      <span className={i === 0 ? "text-yellow-200" : "text-gray-400"}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Row2 – Wallet + Right column */}
            <div className="col-span-3 md:col-span-8 order-5 md:order-6">
              <Card className="md:min-h-[500px] h-full">
                <div className="flex flex-col items-center justify-center py-7 md:py-9 h-full">
                  <WalletRing value={confirmedAvailable} max={minPayout} />
                  <div className="text-[15px] font-extrabold mt-2 font-mono" style={{ color: CABO }}>
                    {t("wallet")}
                  </div>
                  <div className="text-gray-400 text-[11px] font-mono">{t("confirmedBalance")}</div>
                  <div className="text-[22px] font-extrabold font-mono" style={{ color: CABO }}>
                    ₺{Number(confirmedAvailable).toFixed(2)}
                  </div>

                  <div className="text-[11px] mt-1 font-mono">
                    <span className="text-[#81d742]">{t("minPayout")}:</span>
                    <span className="font-bold text-[#81d742]"> ₺{Number(minPayout).toFixed(0)}</span>
                    <span className="mx-2 text-gray-500">•</span>
                    <span className="text-[#e3d67d]">
                      {t("platformCommissionShort")}: %{Number(platformCommission).toFixed(0)}
                    </span>
                  </div>

                  <div
                    className="mt-1 text-[11px] font-bold font-mono"
                    style={{ color: eligible ? GREEN : "#e3d67d" }}
                  >
                    {statusText}
                  </div>

                  <button
                    className={`mt-3 w-[92%] sm:w-full max-w-[360px] py-2 rounded font-bold font-mono text-[#181818] text-[13px] transition-colors ${
                      eligible
                        ? "bg-[#81d742] hover:bg-[#a9ff72]"
                        : "bg-[#323232] text-gray-500 cursor-not-allowed"
                    }`}
                    disabled={!eligible}
                    onClick={() => {
                      if (eligible) window.location.href = "/wallet";
                    }}
                    aria-disabled={!eligible}
                  >
                    {eligible ? (
                      <span className="inline-flex items-center gap-2">
                        {t("requestPayout")} <ChevronRight size={16} />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Lock size={16} /> {ctaLabel}
                      </span>
                    )}
                  </button>

                  {activeRequestCount > 0 && (
                    <div className="mt-2 text-[10.5px] font-mono text-yellow-300">
                      {t("pendingPayoutExists")}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Sağ sütun: (üst) Hoş geldin, (alt) Son Aktiviteler  */}
            <div className="col-span-3 md:col-span-4 order-7 md:order-7">
              <div className="grid grid-rows-2 gap-5 h-full">
                <Card>
                  <div className="px-6 py-5 h-full flex flex-col">
                    <h3 className="text-[15px] font-extrabold text-[#d1ffd0] font-mono mb-2">
                      {t("welcomeDashboard")}
                    </h3>
                    <ul className="list-disc pl-4 text-gray-300 text-[11px] flex flex-col gap-1 font-mono">
                      <li>{t("trackStats")}</li>
                      <li>{t("inviteFriends")}</li>
                      <li>{t("withdrawEarnings")}</li>
                      <li>{t("checkProducts")}</li>
                    </ul>
                    <button className="mt-auto w-full py-2 rounded font-bold font-mono bg-[#81d742] hover:bg-[#a9ff72] text-[#181818]">
                      {t("referFriends")}
                    </button>
                  </div>
                </Card>

                <Card title={t("recentActivity")} icon={<BarChart2 size={16} className="text-[#81d742]" />}>
                  <div className="px-4 py-3 h-full">
                    {recentRows.length === 0 ? (
                      <div className="text-gray-400 text-[11px] font-mono">{t("noActivity")}</div>
                    ) : (
                      <table className="w-full text-[11px] font-mono">
                        <thead className="text-gray-400">
                          <tr className="border-b border-[#232323]">
                            <th className="text-left py-1 px-2">{t("product")}</th>
                            <th className="text-right py-1 px-2">{t("amount")}</th>
                            <th className="text-right py-1 px-2">{t("date")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentRows.slice(0, 6).map((r, i) => (
                            <tr key={i} className="border-b border-[#1b1b1b] last:border-none">
                              <td className="py-1 px-2 text-[#d1ffd0]">{r.product}</td>
                              <td className="py-1 px-2 text-right text-[#81d742]">{r.amount}</td>
                              <td className="py-1 px-2 text-right text-gray-400">{r.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
