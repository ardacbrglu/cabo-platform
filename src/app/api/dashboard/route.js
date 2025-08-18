// src/app/dashboard/page.jsx (veya bulunduğu yer)
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { PiggyBank, Link2, ShoppingCart, BarChart2, Trophy, Lock } from "lucide-react";
import { useUser } from "@/context/UserContext";
import useTranslation from "@/hooks/useTranslation";

const COLOR_CABO = "#d1ffd0";
const COLOR_GREEN = "#81d742";

function WalletProgress({ value, max }) {
  const percent = Math.min((value / max) * 100, 100);
  const radius = 46, stroke = 6, center = 60, circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <div className="relative w-[120px] h-[120px] flex items-center justify-center mb-2 select-none">
      <svg width={120} height={120} className="absolute left-0 top-0 z-0">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#232323" strokeWidth={stroke} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={COLOR_CABO}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s" }}
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

function getDeviceType(userAgent = "") {
  const ua = (userAgent || "").toLowerCase();
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iPhone";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac")) return "Mac";
  return "Other";
}

export default function Dashboard() {
  const router = useRouter();
  const { user: me, ready, isAuthenticated, setUser } = useUser();
  const { t } = useTranslation();

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
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (me?.role && me.role !== "affiliate") {
      router.replace("/unauthorized");
      return;
    }
  }, [ready, isAuthenticated, me?.role, router]);

  // Boyut dinleyicisi
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 700);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Dashboard verileri
  useEffect(() => {
    if (!ready || !isAuthenticated) return;

    let interval;
    let alive = true;

    const fetchStats = async () => {
      try {
        const res = await fetch("/api/dashboard", {
          cache: "no-store",
          credentials: "include",
          headers: { accept: "application/json" },
        });

        if (!alive) return;

        if (res.status === 401 || res.status === 403) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          // 429/500 vb: sessiz — sonraki poll’da toparlar
          return;
        }

        const data = await res.json().catch(() => ({}));

        setStats({
          ...data,
          platformCommission: typeof data.platformCommission === "number" ? data.platformCommission : 5,
          ibanMissing: typeof data.ibanMissing === "boolean" ? data.ibanMissing : false,
          bankMissing: typeof data.bankMissing === "boolean" ? data.bankMissing : false,
          realNameMissing: typeof data.realNameMissing === "boolean" ? data.realNameMissing : false,
          recentActions: Array.isArray(data.recentActions) ? data.recentActions : [],
          leaderboard: Array.isArray(data.leaderboard) ? data.leaderboard : [],
          lastConversion: data.lastConversion || null,
          lastClick: data.lastClick || null,
        });

        setUser((u) => ({
          ...(u || {}),
          name: data.username || "",
          email: data.email || "",
          userId: data.userId || null,
        }));

        setLoading(false);
      } catch {
        // ağ hatası → sessiz; sonraki poll dener
      }
    };

    fetchStats();
    interval = setInterval(fetchStats, 8000);
    return () => {
      alive = false;
      if (interval) clearInterval(interval);
    };
  }, [ready, isAuthenticated, setUser, router]);

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
      {/* ... aşağısı senin mevcut JSX’inle aynı; değişiklik yok ... */}
      {/* Tüm UI bloğunu kısaltmıyorum; yukarıdaki fetch güçlendirmesi yeterli. */}
    </Layout>
  );
}
