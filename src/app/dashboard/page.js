"use client";
/**
 * Affiliate Dashboard (compact) — HYDRATION SAFE
 * - localStorage → navbar jitter fix: useEffect (useLayoutEffect DEĞİL!)
 * - /api/dashboard polling with 429 backoff
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { PiggyBank, Link2, ShoppingCart, BarChart2, Trophy, Lock } from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";
import { apiFetch } from "@/lib/apiFetch";

const COLOR_CABO = "#d1ffd0";
const COLOR_GREEN = "#81d742";

function WalletProgress({ value, max }) {
  const percent = Math.min((value / Math.max(max || 1, 1)) * 100, 100);
  const size = 104, radius = 40, stroke = 6, center = size / 2, circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <div className="relative w-[104px] h-[104px] flex items-center justify-center mb-1 select-none">
      <svg width={size} height={size} className="absolute left-0 top-0 z-0" aria-hidden>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#232323" strokeWidth={stroke} />
        <circle
          cx={center} cy={center} r={radius} fill="none" stroke={COLOR_CABO} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s" }}
        />
      </svg>
      <PiggyBank className="absolute" style={{ color: COLOR_CABO, width: 48, height: 48, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }} />
    </div>
  );
}

function StatCard({ value, label, icon }) {
  return (
    <div className="h-[84px] bg-[#181818] rounded-xl shadow flex flex-col items-center justify-center gap-1.5 overflow-hidden hover:scale-[1.02] transition">
      <span className="text-white">{icon}</span>
      <span className="text-[17px] font-extrabold font-mono text-white leading-none">{value}</span>
      <span className="text-[12px] font-mono text-gray-400">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { user: me, setUser, ready } = useUser();
  const { t } = useTranslation();

  const isReady = typeof ready === "boolean" ? ready : me !== undefined;

  const [stats, setStats] = useState({
    totalClicks: 0, totalSales: 0, totalEarnings: 0,
    balance: 0, minPayout: 100, platformCommission: 5,
    username: "", email: "", userId: null,
    iban: "", bankName: "",
    ibanMissing: false, bankMissing: false, realNameMissing: false,
    recentActions: [], leaderboard: [],
    lastConversion: null, lastClick: null,
  });
  const [loading, setLoading] = useState(true);
  const [payoutstatus, setPayoutstatus] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // ✅ navbar jitter fix — hydrate sonrası çalışsın (useEffect)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cachedName = localStorage.getItem("cabo_username");
    const cachedEmail = localStorage.getItem("cabo_email");
    const cachedId = localStorage.getItem("cabo_userId");
    if (cachedName || cachedEmail || cachedId) {
      setUser((u) => ({
        ...(u || {}),
        name: u?.name || cachedName || "",
        email: u?.email || cachedEmail || "",
        id: u?.id || (cachedId ? Number(cachedId) : u?.id),
        role: u?.role || "affiliate",
      }));
    }
  }, [setUser]);

  // Role guard
  useEffect(() => {
    if (!isReady) return;
    if (me?.role && me.role !== "affiliate") router.replace("/unauthorized");
  }, [isReady, me?.role, router]);

  // Mobile breakpoint
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 700);
    checkMobile(); window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Poll /api/dashboard with 429 backoff
  useEffect(() => {
    if (!isReady) return;

    let timer = null;
    let alive = true;

    const schedule = (ms) => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchStats, Math.max(ms, 8000));
    };

    const fetchStats = async () => {
      try {
        const res = await apiFetch("/api/dashboard", { method: "GET" });
        if (!alive) return;

        if (res.status === 401 || res.status === 403) {
          router.replace("/login");
          return;
        }
        if (res.status === 429) {
          const retryHeader = Number(res.headers?.get?.("Retry-After")) || 0;
          let retryBody = 0;
          try { const j = await res.clone().json(); retryBody = Number(j?.retry_after) || 0; } catch {}
          const waitMs = Math.max((retryHeader || retryBody || 8) * 1000, 8000);
          schedule(waitMs);
          return;
        }
        if (!res.ok) { schedule(8000); return; }

        const data = await res.json().catch(() => ({}));

        setStats((prev) => ({
          ...prev,
          ...data,
          platformCommission: typeof data.platformCommission === "number" ? data.platformCommission : 5,
          ibanMissing: !!data.ibanMissing, bankMissing: !!data.bankMissing, realNameMissing: !!data.realNameMissing,
          recentActions: Array.isArray(data.recentActions) ? data.recentActions : [],
          leaderboard: Array.isArray(data.leaderboard) ? data.leaderboard : [],
          lastConversion: data.lastConversion || null, lastClick: data.lastClick || null,
        }));

        // Context + cache
        setUser((u) => ({
          ...(u || {}),
          name: data.username || u?.name || "",
          email: data.email || u?.email || "",
          id: data.userId || u?.id || null,
          userId: data.userId || u?.userId || null,
          role: "affiliate",
        }));
        if (typeof window !== "undefined") {
          if (data?.username) localStorage.setItem("cabo_username", data.username);
          if (data?.email) localStorage.setItem("cabo_email", data.email);
          if (data?.userId) localStorage.setItem("cabo_userId", String(data.userId));
        }

        setLoading(false);
        schedule(8000);
      } catch {
        schedule(8000);
      }
    };

    fetchStats();
    schedule(8000);

    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [isReady, setUser, router]);

  const {
    totalClicks, totalSales, totalEarnings,
    balance, minPayout, platformCommission,
    recentActions, leaderboard,
    ibanMissing, bankMissing, realNameMissing,
    lastConversion, lastClick,
  } = stats;

  const payoutDisabled = loading || balance < minPayout || ibanMissing || bankMissing || realNameMissing;

  return (
    <Layout>
      <main className="flex flex-col items-center w-full max-w-6xl lg:max-w-7xl mx-auto flex-1 justify-center mt-5 gap-8 px-4 overflow-x-hidden">
        {/* DESKTOP */}
        {!isMobile ? (
          <section className="grid w-full grid-cols-12 gap-7">
            {/* Row 1: Stats */}
            <div className="col-span-4"><StatCard value={totalClicks} label={t("totalClicks")} icon={<Link2 size={18} />} /></div>
            <div className="col-span-4"><StatCard value={totalSales} label={t("totalSales")} icon={<ShoppingCart size={18} />} /></div>
            <div className="col-span-4"><StatCard value={`₺${Number(totalEarnings).toFixed(2)}`} label={t("totalEarnings")} icon={<BarChart2 size={18} />} /></div>

            {/* Row 2: Live / Leaderboard */}
            <div className="col-span-8 bg-[#181818] rounded-xl shadow flex flex-col items-center py-3 px-4 min-h-[140px] overflow-hidden">
              <span className="flex items-center gap-2 font-mono font-bold text-[15px]" style={{ color: "#81d742" }}>
                <BarChart2 className="text-white" size={16} /> {t("liveStats")}
              </span>
              <p className="text-gray-400 mt-1 text-[12px] font-mono">{t("liveStatsDesc")}</p>
              {lastConversion && (
                <div className="flex gap-3 mt-3 px-3 py-2 bg-[#191b19] rounded-lg items-center w-full max-w-xs justify-between font-mono text-[12px]">
                  <span className="font-bold text-[#81d742]">
                    {new Date(lastConversion.time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </span>
                  <span className="text-[#d1ffd0]">{lastConversion.productName}</span>
                  <span className="font-bold text-[#81d742]">₺{Number(lastConversion.commission).toFixed(2)}</span>
                  <span className="text-gray-400">x{lastConversion.quantity}</span>
                </div>
              )}
              {lastClick && (
                <div className="flex gap-3 mt-3 px-3 py-2 bg-[#232523] rounded-lg items-center w-full max-w-xs justify-between font-mono text-[12px]">
                  <span className="font-bold text-[#81d742]">
                    {new Date(lastClick.time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </span>
                  <span className="text-[#d1ffd0]">{lastClick.productName}</span>
                  <span className="text-blue-400">Click</span>
                  <span className="text-gray-400">{lastClick.extra || "-"}</span>
                </div>
              )}
              {!lastConversion && !lastClick && <span className="text-gray-500 mt-2 text-[12px]">{t("noRecentActivity")}</span>}
            </div>

            <div className="col-span-4 bg-[#181818] rounded-xl shadow py-4 px-4 flex flex-col items-center min-h-[140px] overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="text-[#81d742]" size={16} />
                <span className="font-extrabold text-[15px] font-mono" style={{ color: COLOR_CABO }}>{t("leaderboard")}</span>
              </div>
              <div className="flex flex-col gap-1 w-full">
                {(leaderboard || []).map((lb, i) => (
                  <div key={`${lb.name}-${i}`} className="flex justify-between w-full text-[12px] px-2 font-mono">
                    <span className="font-bold" style={{ color: COLOR_GREEN }}>{i + 1}.</span>
                    <span className={lb.name === stats.username ? "font-bold" : ""} style={{ color: lb.name === stats.username ? COLOR_CABO : "#f6f6f6" }}>
                      {lb.name === stats.username ? t("you") : lb.name}
                    </span>
                    <span className={i === 0 ? "text-yellow-200" : "text-gray-400"}>{lb.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 3: Wallet+Payout / Onboarding */}
            <div className="col-span-8 bg-[#181818] rounded-xl shadow flex flex-col items-center py-4 px-5 min-h-[240px] overflow-hidden">
              <WalletProgress value={balance} max={minPayout} />
              <div className="text-[17px] font-extrabold mb-1 font-mono" style={{ color: COLOR_CABO }}>{t("wallet")}</div>
              <div className="text-gray-400 text-[12px] font-mono">{t("balance")}</div>
              <div className="text-[18px] font-extrabold font-mono" style={{ color: COLOR_CABO }}>₺{Number(balance).toFixed(2)}</div>
              <div className="text-[12px] mb-1 font-mono"><span style={{ color: "#81d742" }}>{t("minPayout")}:</span><span style={{ color: COLOR_GREEN, fontWeight: 700 }}> {minPayout}</span></div>
              <div className="mt-1 text-[12px] font-bold font-mono" style={{ color: balance < minPayout ? "#e3d67d" : COLOR_GREEN }}>
                {balance < minPayout ? t("earnMoreToPayout") : t("eligiblePayout")}
              </div>

              <div className="w-full max-w-sm mt-3">
                <div className="text-[13px] font-extrabold mb-2 font-mono text-center" style={{ color: COLOR_CABO }}>{t("payoutRequest")}</div>
                <button
                  className={`flex items-center justify-center gap-2 w-full py-2.5 rounded font-bold font-mono text-[#181818] ${
                    payoutDisabled ? "bg-[#323232] text-gray-500 cursor-not-allowed" : "bg-[#81d742] hover:bg-[#a9ff72] transition-all"
                  } text-[14px]`}
                  disabled={payoutDisabled}
                  onClick={() => router.push("/wallet")}
                >
                  {loading ? t("processing") : payoutDisabled ? (<><Lock size={17} className="inline-block mr-1" />{t("enterValidBank")}</>) : t("requestPayout")}
                </button>
                <div className="mt-2 text-[12px] font-mono text-gray-400 text-center">
                  <span className="text-gray-300">{t("platformCommission")}: <span style={{ color: COLOR_GREEN }}>{platformCommission}%</span></span>
                </div>
                {payoutstatus === "success" && <div className="mt-2 text-green-400 text-[12px] text-center font-mono">{t("requestCreated")}</div>}
                {payoutstatus && payoutstatus !== "success" && <div className="mt-2 text-red-400 text-[12px] text-center font-mono">{payoutstatus}</div>}
                <div className="mt-1 text-[12px] text-gray-400 text-center font-mono">{t("minThresholdNote")}</div>
              </div>
            </div>

            <div className="col-span-4 bg-[#181818] rounded-xl shadow py-4 px-6 flex flex-col items-center justify-center min-h-[220px] overflow-hidden">
              <div className="font-extrabold mb-2 text-[15px] font-mono" style={{ color: COLOR_CABO }}>{t("welcomeDashboard")}</div>
              <ul className="list-disc pl-4 text-gray-300 text-[12px] flex flex-col gap-1 font-mono">
                <li>{t("trackStats")}</li><li>{t("inviteFriends")}</li><li>{t("withdrawEarnings")}</li><li>{t("checkProducts")}</li>
              </ul>
              <button className="mt-5 w-full py-2 rounded font-bold font-mono transition" style={{ background: COLOR_GREEN, color: "#181818", fontSize: "0.95rem" }}>
                {t("referFriends")}
              </button>
            </div>

            {/* Row 4: Recent Activity */}
            <div className="col-span-12 bg-[#181818] rounded-xl shadow py-4 px-6 overflow-hidden">
              <div className="font-extrabold mb-3 text-[15px] font-mono" style={{ color: "#81d742" }}>{t("recentActivity")}</div>
              <div className="flex flex-col gap-2">
                {Array.isArray(recentActions) && recentActions.length > 0 ? recentActions.map((a, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[12px] py-1 border-b border-[#1b1b1b] last:border-none font-mono">
                    <span className="font-bold" style={{ color: COLOR_GREEN }}>{a.amount}</span>
                    <span className="text-gray-300">{a.desc}</span>
                    <span className="text-gray-400 text-[11px]">{a.date}</span>
                  </div>
                )) : <div className="text-gray-400 text-[12px] font-mono py-2">{t("noActivity")}</div>}
              </div>
            </div>
          </section>
        ) : (
          /* MOBILE */
          <>
            <section className="w-full">
              <div className="grid grid-cols-3 gap-3 w-full">
                <StatCard value={totalClicks} label={t("totalClicks")} icon={<Link2 size={20} />} />
                <StatCard value={totalSales} label={t("totalSales")} icon={<ShoppingCart size={20} />} />
                <StatCard value={`₺${Number(totalEarnings).toFixed(2)}`} label={t("totalEarnings")} icon={<BarChart2 size={20} />} />
              </div>
            </section>

            <div className="bg-[#181818] rounded-xl shadow flex flex-col items-center py-3 px-2 mt-2 w-full">
              <span className="flex items-center gap-2 font-mono font-bold text-base" style={{ color: COLOR_GREEN }}>
                <BarChart2 className="text-white" size={17} /> {t("liveStats")}
              </span>
              <p className="text-gray-400 mt-1 text-xs font-mono">{t("liveStatsDesc")}</p>
              {lastConversion ? (
                <div className="flex gap-3 mt-3 px-3 py-2 bg-[#191b19] rounded-lg items-center w-full max-w-xs justify-between font-mono text-xs">
                  <span className="font-bold text-[#81d742]">
                    {new Date(lastConversion.time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </span>
                  <span className="text-[#d1ffd0]">{lastConversion.productName}</span>
                  <span className="font-bold text-[#81d742]">₺{Number(lastConversion.commission).toFixed(2)}</span>
                  <span className="text-gray-400">x{lastConversion.quantity}</span>
                </div>
              ) : lastClick ? (
                <div className="flex gap-3 mt-3 px-3 py-2 bg-[#232523] rounded-lg items-center w-full max-w-xs justify-between font-mono text-xs">
                  <span className="font-bold text-[#81d742]">
                    {new Date(lastClick.time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                  </span>
                  <span className="text-[#d1ffd0]">{lastClick.productName}</span>
                  <span className="text-blue-400">Click</span>
                  <span className="text-gray-400">{lastClick.extra || "-"}</span>
                </div>
              ) : <span className="text-gray-500 mt-2">{t("noRecentActivity")}</span>}
            </div>

            {/* Wallet + Payout */}
            <div className="bg-[#181818] rounded-xl shadow flex flex-col items-center py-5 px-4 mt-3 w-full">
              <WalletProgress value={balance} max={minPayout} />
              <div className="text-lg font-extrabold mb-1 font-mono" style={{ color: COLOR_CABO }}>{t("wallet")}</div>
              <div className="text-gray-400 text-xs font-mono">{t("balance")}</div>
              <div className="text-xl font-extrabold font-mono" style={{ color: COLOR_CABO }}>₺{Number(balance).toFixed(2)}</div>
              <div className="text-xs mb-1 font-mono"><span style={{ color: "#81d742" }}>{t("minPayout")}:</span><span style={{ color: COLOR_GREEN, fontWeight: 700 }}> {minPayout}</span></div>
              <div className="mt-1 text-xs font-bold font-mono" style={{ color: balance < minPayout ? "#e3d67d" : COLOR_GREEN }}>
                {balance < minPayout ? t("earnMoreToPayout") : t("eligiblePayout")}
              </div>

              <button
                className={`w-full mt-3 py-3 rounded-lg font-bold font-mono text-[#181818] ${
                  payoutDisabled ? "bg-[#323232] text-gray-500 cursor-not-allowed" : "bg-[#81d742] hover:bg-[#a9ff72] transition"
                } text-base`}
                disabled={payoutDisabled}
                onClick={() => router.push("/wallet")}
              >
                {loading ? t("processing") : payoutDisabled ? (<><Lock size={17} className="inline-block mr-2" />{t("enterValidBank")}</>) : t("requestPayout")}
              </button>
              <div className="mt-2 text-xs font-mono text-gray-400 text-center">
                <span className="text-gray-300">{t("platformCommission")}: <span style={{ color: COLOR_GREEN }}>{platformCommission}%</span></span>
              </div>
              <div className="mt-1 text-xs text-gray-400 text-center font-mono">{t("minThresholdNote")}</div>
            </div>

            {/* Leaderboard */}
            <div className="bg-[#181818] rounded-xl shadow py-4 px-3 flex flex-col items-center mt-3 w-full">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="text-[#81d742]" size={16} />
                <span className="font-extrabold text-sm font-mono" style={{ color: COLOR_CABO }}>{t("leaderboard")}</span>
              </div>
              <div className="flex flex-col gap-1 w-full">
                {(leaderboard || []).map((lb, i) => (
                  <div key={`${lb.name}-${i}`} className="flex justify-between w-full text-xs px-2 font-mono">
                    <span className="font-bold" style={{ color: COLOR_GREEN }}>{i + 1}.</span>
                    <span className={lb.name === stats.username ? "font-bold" : ""} style={{ color: lb.name === stats.username ? COLOR_CABO : "#f6f6f6" }}>
                      {lb.name === stats.username ? t("you") : lb.name}
                    </span>
                    <span className={i === 0 ? "text-yellow-200" : "text-gray-400"}>{lb.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity - Mobile */}
            <div className="bg-[#181818] rounded-xl shadow py-4 px-4 mt-3 w-full">
              <div className="font-extrabold mb-2 text-sm font-mono" style={{ color: "#81d742" }}>{t("recentActivity")}</div>
              <div className="flex flex-col gap-2">
                {Array.isArray(recentActions) && recentActions.length > 0 ? recentActions.map((a, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-[#1b1b1b] last:border-none font-mono">
                    <span className="font-bold" style={{ color: COLOR_GREEN }}>{a.amount}</span>
                    <span className="text-gray-300">{a.desc}</span>
                    <span className="text-gray-400 text-[11px]">{a.date}</span>
                  </div>
                )) : <div className="text-gray-400 text-xs font-mono py-1.5">{t("noActivity")}</div>}
              </div>
            </div>

            {/* Onboarding */}
            <div className="bg-[#181818] rounded-xl shadow py-4 px-4 mt-3 w-full flex flex-col items-center">
              <div className="font-extrabold mb-2 text-base font-mono" style={{ color: COLOR_CABO }}>{t("welcomeDashboard")}</div>
              <ul className="list-disc pl-4 text-gray-300 text-xs flex flex-col gap-1 font-mono">
                <li>{t("trackStats")}</li><li>{t("inviteFriends")}</li><li>{t("withdrawEarnings")}</li><li>{t("checkProducts")}</li>
              </ul>
              <button className="mt-5 w-full py-2 rounded font-bold font-mono transition" style={{ background: COLOR_GREEN, color: "#181818", fontSize: "0.95rem" }}>
                {t("referFriends")}
              </button>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        html, body, #__next, main { overflow-x: hidden !important; }
        @media (max-width: 700px) {
          main, section, .w-full { width: 100% !important; min-width: 0 !important; }
        }
      `}</style>
    </Layout>
  );
}
