"use client";

/**
 * File: src/app/dashboard/page.js
 * Purpose: Affiliate kullanıcı dashboard'u (özet, canlı aktivite, cüzdan, leaderboard).
 *
 * Security Docblock (Cabo PROD)
 * - Frontend tüm istekler: tek apiFetch wrapper (credentials:include, X-Requested-With, X-Request-Id).
 * - GET /api/dashboard: CSRF gereksiz; 401 → /login, 403 'inactive' → /activate, diğer 403 → /unauthorized.
 * - Rate-limit 429: Retry-After/body.retry_after değerine göre polling backoff uygulanır (min 8sn).
 * - PII minimal: yalnız gerekli alanlar UI'da gösterilir.
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
  const radius = 46, stroke = 6, center = 60, circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <div className="relative w-[120px] h-[120px] flex items-center justify-center mb-2 select-none">
      <svg width={120} height={120} className="absolute left-0 top-0 z-0" aria-hidden>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#232323" strokeWidth={stroke} />
        <circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={COLOR_CABO} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s" }}
        />
      </svg>
      <PiggyBank className="absolute" style={{ color: COLOR_CABO, width: 56, height: 56, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }} />
    </div>
  );
}

function StatCard({ value, label, icon }) {
  return (
    <div className="flex-1 bg-[#181818] rounded-xl py-6 shadow flex flex-col items-center gap-1 min-w-[120px] hover:scale-105 transition">
      <span className="text-white">{icon}</span>
      <span className="text-lg font-extrabold font-mono text-white">{value}</span>
      <span className="text-xs font-mono text-gray-400">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const ctx = useUser() || {};
  const me = ctx.user;
  const setUser = ctx.setUser || (() => {});
  const { t } = useTranslation();

  // Context geride kalırsa güvenli fallback
  const isReady = typeof ctx.ready === "boolean" ? ctx.ready : me !== undefined;
  const isAuth  = typeof ctx.isAuthenticated === "boolean" ? ctx.isAuthenticated : !!(me && me.id);

  const [stats, setStats] = useState({
    totalClicks: 0,
    totalSales: 0,
    totalEarnings: 0,
    balance: 0,
    minPayout: 100,
    platformCommission: 5,
    username: "",
    email: "",
    userId: null,
    iban: "",
    bankName: "",
    ibanMissing: false,
    bankMissing: false,
    realNameMissing: false,
    recentActions: [],
    leaderboard: [],
    lastConversion: null,
    lastClick: null,
  });
  const [loading, setLoading] = useState(true);
  const [payoutstatus, setPayoutstatus] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // Auth/RBAC yönlendirme
  useEffect(() => {
    if (!isReady) return;
    if (!isAuth) {
      router.replace("/login");
      return;
    }
    if (me?.role && me.role !== "affiliate") {
      router.replace("/unauthorized");
      return;
    }
  }, [isReady, isAuth, me?.role, router]);

  // Ekran boyutu
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 700);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Dashboard polling (+ 429 backoff)
  useEffect(() => {
    if (!isReady || !isAuth) return;

    let timer = null;
    let alive = true;

    const schedule = (ms) => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchStats, Math.max(ms, 8000)); // min 8s
    };

    const fetchStats = async () => {
      try {
        const res = await apiFetch("/api/dashboard", { method: "GET" });
        if (!alive) return;

        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          let reason = "";
          try { const j = await res.clone().json(); reason = j?.error || ""; } catch {}
          if (reason === "inactive") router.replace("/activate");
          else router.replace("/unauthorized");
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
        if (!res.ok) {
          // 5xx/diğer — sessiz; bir sonraki poll denesin
          schedule(8000);
          return;
        }

        const data = await res.json().catch(() => ({}));

        setStats((prev) => ({
          ...prev,
          ...data,
          platformCommission: typeof data.platformCommission === "number" ? data.platformCommission : 5,
          ibanMissing: !!data.ibanMissing,
          bankMissing: !!data.bankMissing,
          realNameMissing: !!data.realNameMissing,
          recentActions: Array.isArray(data.recentActions) ? data.recentActions : [],
          leaderboard: Array.isArray(data.leaderboard) ? data.leaderboard : [],
          lastConversion: data.lastConversion || null,
          lastClick: data.lastClick || null,
        }));

        setUser((u) => ({
          ...(u || {}),
          name: data.username || "",
          email: data.email || "",
          id: data.userId || u?.id || null,
          userId: data.userId || u?.userId || null,
          role: "affiliate",
        }));

        setLoading(false);
        schedule(8000);
      } catch {
        // ağ hatası → sessiz; yeniden dene
        schedule(8000);
      }
    };

    fetchStats();
    schedule(8000);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [isReady, isAuth, setUser, router]);

  const {
    totalClicks,
    totalSales,
    totalEarnings,
    balance,
    minPayout,
    platformCommission,
    recentActions,
    leaderboard,
    ibanMissing,
    bankMissing,
    realNameMissing,
    lastConversion,
    lastClick,
  } = stats;

  const payoutDisabled = loading || balance < minPayout || ibanMissing || bankMissing || realNameMissing;

  const BankWarningBar =
    !loading &&
    (ibanMissing || bankMissing || realNameMissing) && (
      <div
        className={`w-full max-w-2xl mx-auto bg-red-900/80 text-red-200 font-mono rounded-xl px-6 py-3 text-sm text-center mb-3 border border-red-700 shadow animate-pulse z-40 ${
          isMobile ? "fixed left-0 right-0 top-14 mx-auto mt-0" : "relative mt-0"
        }`}
        style={isMobile ? { marginTop: "0px" } : {}}
      >
        <b>{t("bankInfoMissing")}</b> {t("mustAddBank")}
        <br />
        <span className="text-xs">
          {ibanMissing && <>{t("ibanMissing")}&nbsp;</>}
          {bankMissing && <>{t("bankNameMissing")}&nbsp;</>}
          {realNameMissing && <>{t("realNameMissing")}&nbsp;</>}
        </span>
        <br />
        <span className="text-yellow-200">{t("updateDetailsWallet")}</span>
      </div>
    );

  return (
    <Layout>
      <main className="flex flex-col items-center w-full max-w-7xl mx-auto flex-1 justify-center mt-5 gap-8 px-4 overflow-x-hidden">
        {BankWarningBar}

        {/* Desktop */}
        {!isMobile ? (
          <>
            <section className="flex gap-5 w-full overflow-x-hidden">
              <StatCard value={totalClicks} label={t("totalClicks")} icon={<Link2 size={22} />} />
              <StatCard value={totalSales} label={t("totalSales")} icon={<ShoppingCart size={22} />} />
              <StatCard value={`₺${Number(totalEarnings).toFixed(2)}`} label={t("totalEarnings")} icon={<BarChart2 size={22} />} />
            </section>

            <section className="flex w-full gap-5">
              <div className="flex flex-col gap-5 flex-[2]">
                <div className="bg-[#181818] rounded-xl shadow flex flex-col items-center py-4 px-5">
                  <span className="flex items-center gap-2 font-mono font-bold text-base" style={{ color: "#81d742" }}>
                    <BarChart2 className="text-white" size={17} /> {t("liveStats")}
                  </span>
                  <p className="text-gray-400 mt-1 text-xs font-mono">{t("liveStatsDesc")}</p>
                  {lastConversion && (
                    <div className="flex gap-3 mt-3 px-3 py-2 bg-[#191b19] rounded-lg items-center w-full max-w-xs justify-between font-mono text-xs">
                      <span className="font-bold text-[#81d742]">
                        {new Date(lastConversion.time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </span>
                      <span className="text-[#d1ffd0]">{lastConversion.productName}</span>
                      <span className="font-bold text-[#81d742]">₺{Number(lastConversion.commission).toFixed(2)}</span>
                      <span className="text-gray-400">x{lastConversion.quantity}</span>
                    </div>
                  )}
                  {lastClick && (
                    <div className="flex gap-3 mt-3 px-3 py-2 bg-[#232523] rounded-lg items-center w-full max-w-xs justify-between font-mono text-xs">
                      <span className="font-bold text-[#81d742]">
                        {new Date(lastClick.time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </span>
                      <span className="text-[#d1ffd0]">{lastClick.productName}</span>
                      <span className="text-blue-400">Click</span>
                      <span className="text-gray-400">{lastClick.extra || "-"}</span>
                    </div>
                  )}
                  {!lastConversion && !lastClick && <span className="text-gray-500 mt-2">{t("noRecentActivity")}</span>}
                </div>

                <div className="bg-[#181818] rounded-xl shadow flex flex-col items-center py-5 px-6">
                  <WalletProgress value={balance} max={minPayout} />
                  <div className="text-lg font-extrabold mb-1 font-mono" style={{ color: COLOR_CABO }}>
                    {t("wallet")}
                  </div>
                  <div className="text-gray-400 text-xs font-mono">{t("balance")}</div>
                  <div className="text-xl font-extrabold font-mono" style={{ color: COLOR_CABO }}>
                    ₺{Number(balance).toFixed(2)}
                  </div>
                  <div className="text-xs mb-1 font-mono">
                    <span style={{ color: "#81d742" }}>{t("minPayout")}:</span>
                    <span style={{ color: COLOR_GREEN, fontWeight: 700 }}> {minPayout}</span>
                  </div>
                  <div className="mt-2 text-xs font-bold animate-pulse font-mono" style={{ color: balance < minPayout ? "#e3d67d" : COLOR_GREEN }}>
                    {balance < minPayout ? <>{t("earnMoreToPayout")}</> : <>{t("eligiblePayout")}</>}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-5 flex-1">
                <div className="bg-[#181818] rounded-xl shadow flex flex-col items-center py-6 px-6">
                  <div className="text-lg font-extrabold mb-3 font-mono" style={{ color: COLOR_CABO }}>
                    {t("payoutRequest")}
                  </div>
                  <button
                    className={`flex items-center justify-center gap-2 w-full py-2 rounded font-bold font-mono text-[#181818] ${
                      loading || balance < minPayout || ibanMissing || bankMissing || realNameMissing
                        ? "bg-[#323232] text-gray-500 cursor-not-allowed"
                        : "bg-[#81d742] hover:bg-[#a9ff72] transition-all"
                    } text-base mb-1`}
                    style={{ fontSize: "1.02rem" }}
                    disabled={loading || balance < minPayout || ibanMissing || bankMissing || realNameMissing}
                    onClick={() => router.push("/wallet")}
                  >
                    {loading ? t("processing") : (loading || balance < minPayout || ibanMissing || bankMissing || realNameMissing) ? (
                      <>
                        <Lock size={18} className="inline-block mr-2" />
                        {t("enterValidBank")}
                      </>
                    ) : (
                      t("requestPayout")
                    )}
                  </button>
                  <div className="mt-1 text-xs font-mono text-gray-400 text-center">
                    <span className="text-gray-300">
                      {t("platformCommission")}: <span style={{ color: COLOR_GREEN }}>{platformCommission}%</span>
                    </span>
                  </div>
                  {payoutstatus === "success" && <div className="mt-2 text-green-400 text-xs text-center font-mono">{t("requestCreated")}</div>}
                  {payoutstatus && payoutstatus !== "success" && <div className="mt-2 text-red-400 text-xs text-center font-mono">{payoutstatus}</div>}
                  <div className="mt-2 text-xs text-gray-400 text-center font-mono">{t("minThresholdNote")}</div>
                </div>

                <div className="bg-[#181818] rounded-xl shadow py-5 px-4 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="text-[#81d742]" size={17} />
                    <span className="font-extrabold text-base font-mono" style={{ color: COLOR_CABO }}>
                      {t("leaderboard")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 w-full">
                    {(leaderboard || []).map((lb, i) => (
                      <div key={`${lb.name}-${i}`} className="flex justify-between w-full text-xs px-2 font-mono">
                        <span className="font-bold" style={{ color: COLOR_GREEN }}>{i + 1}.</span>
                        <span className={lb.name === stats.username ? "font-bold" : ""} style={{ color: lb.name === stats.username ? COLOR_CABO : "#f6f6f6" }}>
                          {lb.name === stats.username ? t("you") : lb.name}
                        </span>
                        <span className={i === 0 ? "text-yellow-20 0" : "text-gray-400"}>{lb.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Recent & Onboarding */}
            <section className="flex w-full gap-5 mb-3">
              <div className="flex-1 bg-[#181818] rounded-xl shadow py-5 px-7">
                <div className="font-extrabold mb-3 text-lg font-mono" style={{ color: "#81d742" }}>
                  {t("recentActivity")}
                </div>
                <div className="flex flex-col gap-2">
                  {recentActions && recentActions.length > 0 ? (
                    recentActions.map((a, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-[#1b1b1b] last:border-none font-mono">
                        <span className="font-bold" style={{ color: COLOR_GREEN }}>{a.amount}</span>
                        <span className="text-gray-300">{a.desc}</span>
                        <span className="text-gray-400 text-xs">{a.date}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400 text-xs font-mono py-2">{t("noActivity")}</div>
                  )}
                </div>
              </div>

              <div className="w-80 bg-[#181818] rounded-xl shadow py-5 px-6 flex flex-col items-center justify-center">
                <div className="font-extrabold mb-2 text-lg font-mono" style={{ color: COLOR_CABO }}>
                  {t("welcomeDashboard")}
                </div>
                <ul className="list-disc pl-4 text-gray-300 text-xs flex flex-col gap-1 font-mono">
                  <li>{t("trackStats")}</li>
                  <li>{t("inviteFriends")}</li>
                  <li>{t("withdrawEarnings")}</li>
                  <li>{t("checkProducts")}</li>
                </ul>
                <button className="mt-5 w-full py-2 rounded font-bold font-mono transition" style={{ background: COLOR_GREEN, color: "#181818", fontSize: "0.98rem" }}>
                  {t("referFriends")}
                </button>
              </div>
            </section>
          </>
        ) : (
          // Mobile
          <>
            <section className="flex flex-col gap-3 w-full items-center">
              <div className="flex flex-row gap-3 w-full">
                <StatCard value={totalClicks} label={t("totalClicks")} icon={<Link2 size={22} />} />
                <StatCard value={totalSales} label={t("totalSales")} icon={<ShoppingCart size={22} />} />
                <StatCard value={`₺${Number(totalEarnings).toFixed(2)}`} label={t("totalEarnings")} icon={<BarChart2 size={22} />} />
              </div>
            </section>

            <div className="bg-[#181818] rounded-xl shadow flex flex-col items-center py-3 px-1 mt-1 w-full">
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
              ) : (
                <span className="text-gray-500 mt-2">{t("noRecentActivity")}</span>
              )}
            </div>

            <div className="bg-[#181818] rounded-xl shadow flex flex-col items-center py-5 px-4 mt-3 w-full">
              <WalletProgress value={balance} max={minPayout} />
              <div className="text-lg font-extrabold mb-1 font-mono" style={{ color: COLOR_CABO }}>{t("wallet")}</div>
              <div className="text-gray-400 text-xs font-mono">{t("balance")}</div>
              <div className="text-xl font-extrabold font-mono" style={{ color: COLOR_CABO }}>₺{Number(balance).toFixed(2)}</div>
              <div className="text-xs mb-1 font-mono">
                <span style={{ color: "#81d742" }}>{t("minPayout")}:</span>
                <span style={{ color: COLOR_GREEN, fontWeight: 700 }}> {minPayout}</span>
              </div>
              <div className="mt-2 text-xs font-bold animate-pulse font-mono" style={{ color: balance < minPayout ? "#e3d67d" : COLOR_GREEN }}>
                {balance < minPayout ? t("earnMoreToPayout") : t("eligiblePayout")}
              </div>
              <button
                className={`w-full mt-3 py-3 rounded-lg font-bold font-mono text-[#181818] ${
                  (loading || balance < minPayout || ibanMissing || bankMissing || realNameMissing)
                    ? "bg-[#323232] text-gray-500 cursor-not-allowed"
                    : "bg-[#81d742] hover:bg-[#a9ff72] transition"
                } text-base`}
                style={{ fontSize: "1.07rem" }}
                disabled={loading || balance < minPayout || ibanMissing || bankMissing || realNameMissing}
                onClick={() => router.push("/wallet")}
              >
                {loading ? t("processing") : (loading || balance < minPayout || ibanMissing || bankName === "" || realNameMissing) ? (
                  <>
                    <Lock size={17} className="inline-block mr-2" />
                    {t("enterValidBank")}
                  </>
                ) : (
                  t("requestPayout")
                )}
              </button>
              <div className="mt-2 text-xs font-mono text-gray-400 text-center">
                <span className="text-gray-300">
                  {t("platformCommission")}: <span style={{ color: COLOR_GREEN }}>{platformCommission}%</span>
                </span>
              </div>
              <div className="mt-2 text-xs text-gray-400 text-center font-mono">{t("minThresholdNote")}</div>
            </div>

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

            <div className="bg-[#181818] rounded-xl shadow py-4 px-4 mt-3 w-full flex flex-col items-center">
              <div className="font-extrabold mb-2 text-base font-mono" style={{ color: COLOR_CABO }}>{t("welcomeDashboard")}</div>
              <ul className="list-disc pl-4 text-gray-300 text-xs flex flex-col gap-1 font-mono">
                <li>{t("trackStats")}</li>
                <li>{t("inviteFriends")}</li>
                <li>{t("withdrawEarnings")}</li>
                <li>{t("checkProducts")}</li>
              </ul>
              <button className="mt-5 w-full py-2 rounded font-bold font-mono transition" style={{ background: COLOR_GREEN, color: "#181818", fontSize: "0.98rem" }}>
                {t("referFriends")}
              </button>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        html, body, #__next, main { overflow-x: hidden !important; }
        @media (max-width: 700px) {
          .w-80 { width: 100% !important; min-width: 0 !important; }
          .flex.gap-5 { flex-direction: column !important; gap: 18px !important; }
          .flex.flex-row.gap-3.w-full { flex-direction: row !important; }
          main, section, .w-full { width: 100% !important; min-width: 0 !important; }
          .flex.gap-5.w-full, .flex.flex-row.gap-3.w-full { flex-wrap: wrap; }
        }
      `}</style>
    </Layout>
  );
}
