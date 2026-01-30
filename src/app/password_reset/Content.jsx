// src/app/password_reset/Content.jsx
"use client";

/**
 * Security Docblock (Cabo PROD - UI)
 * - Public password reset UI (request + confirm)
 * - Uses apiFetch (credentials include + X-Requested-With + X-Request-Id + CSRF header via wrapper)
 * - Preloads NextAuth CSRF cookie via /api/auth/csrf
 * - Enumeration-safe UX for request (always success message)
 * - Locale is read from navbar state (NEXT_LOCALE cookie/localStorage) and live-synced
 * - Minimal login/register-like styling + glow/halo behind card
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

const translations = {
  en: {
    requestTitle: "Reset your password",
    emailPlaceholder: "Email",
    sendBtn: "Send",
    sending: "Sending...",
    sentMsg: "If an account exists, we've emailed a reset link.",
    invalidEmail: "Please enter a valid email address.",
    requiredEmail: "Please fill out all fields.",
    rate: "Too many attempts. Please try again.",
    processing: "Processing...",

    confirmTitle: "Set a new password",
    newPw: "New Password",
    newPwPh: "New password (min 8 characters)",
    newPwRpt: "Repeat New Password",
    newPwRptPh: "Repeat new password",
    saveBtn: "Set Password",
    short: "Password must be at least 8 characters.",
    mismatch: "Passwords do not match!",
    ok: "Password set!",
    server: "Server error. Please try again.",
    loginLink: "Go to login page",
  },
  tr: {
    requestTitle: "Şifreni sıfırla",
    emailPlaceholder: "E-posta",
    sendBtn: "Gönder",
    sending: "Gönderiliyor...",
    sentMsg: "Hesap varsa şifre sıfırlama bağlantısı e-posta ile gönderildi.",
    invalidEmail: "Lütfen geçerli bir e-posta adresi girin.",
    requiredEmail: "Lütfen tüm alanları doldurun.",
    rate: "Çok fazla deneme. Lütfen tekrar deneyin.",
    processing: "İşleniyor...",

    confirmTitle: "Yeni şifre belirle",
    newPw: "Yeni Şifre",
    newPwPh: "Yeni şifre (min 8 karakter)",
    newPwRpt: "Yeni Şifre (tekrar)",
    newPwRptPh: "Yeni şifreyi tekrar girin",
    saveBtn: "Şifreyi Güncelle",
    short: "Şifre en az 8 karakter olmalıdır.",
    mismatch: "Şifreler eşleşmiyor!",
    ok: "Şifreniz güncellendi!",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    loginLink: "Giriş sayfasına git",
  },
};

function safeLower(s) {
  try {
    return String(s || "").toLowerCase();
  } catch {
    return "";
  }
}
function normalizeLang(x) {
  const s = safeLower(x);
  if (s.startsWith("tr")) return "tr";
  if (s.startsWith("en")) return "en";
  return "";
}
function readCookie(name) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function readNavLocale(initialLang) {
  // ✅ Navbar ile uyum: NEXT_LOCALE en yaygın
  const cNext = normalizeLang(readCookie("NEXT_LOCALE"));
  if (cNext) return cNext;

  // bazı projelerde farklı key’ler:
  const cCabo = normalizeLang(readCookie("cabo_lang"));
  if (cCabo) return cCabo;

  const cLocale = normalizeLang(readCookie("locale"));
  if (cLocale) return cLocale;

  if (typeof localStorage !== "undefined") {
    const ls = normalizeLang(
      localStorage.getItem("NEXT_LOCALE") ||
        localStorage.getItem("cabo_lang") ||
        localStorage.getItem("locale") ||
        localStorage.getItem("lang")
    );
    if (ls) return ls;
  }

  // email link fallback: ?lang=tr|en
  const q = normalizeLang(initialLang);
  if (q) return q;

  const nav = normalizeLang(typeof navigator !== "undefined" ? navigator.language : "");
  return nav || "en";
}

export default function PasswordResetContent({ token, initialLang }) {
  const computeLang = useCallback(() => readNavLocale(initialLang), [initialLang]);
  const [lang, setLang] = useState(() => computeLang());

  // Live sync: storage + cookie polling
  useEffect(() => {
    let alive = true;

    const sync = () => {
      if (!alive) return;
      const next = computeLang();
      setLang((prev) => (prev === next ? prev : next));
    };

    sync();

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === "NEXT_LOCALE" || e.key === "cabo_lang" || e.key === "locale" || e.key === "lang") sync();
    };

    window.addEventListener("storage", onStorage);
    const iv = setInterval(sync, 700);

    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
      clearInterval(iv);
    };
  }, [computeLang]);

  const dict = translations[lang] || translations.en;
  const t = (k) => (dict && k in dict ? dict[k] : k);

  // CSRF preload
  const [csrfReady, setCsrfReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" });
      } finally {
        if (alive) setCsrfReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const mode = token ? "confirm" : "request";

  // ===== Styles (login/register-like + glow) =====
  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-[#0f0f0f] text-[#eaeaea] border border-[#232323] " +
    "placeholder:text-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-[#81d742] focus:border-transparent";

  const buttonClass =
    "w-full mt-4 rounded-xl bg-[#81d742] hover:bg-[#a8ff9f] text-[#0b0b0b] font-extrabold py-3 transition " +
    "disabled:opacity-60 disabled:hover:bg-[#81d742]";

  const Card = useMemo(() => {
    return function CardWrap({ children }) {
      return (
        <main className="min-h-[72vh] flex items-center justify-center px-4 py-10">
          <div className="relative w-full max-w-[380px]">
            {/* ✅ Glow / light effect behind the card */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-6 rounded-[28px] blur-3xl opacity-30"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 40%, rgba(129,215,66,0.55) 0%, rgba(129,215,66,0.16) 35%, rgba(0,0,0,0) 70%)",
              }}
            />

            <div className="relative bg-[#111] border border-[#232323] rounded-2xl px-6 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              {children}
            </div>
          </div>

          {/* Autofill “mavi” fix */}
          <style jsx global>{`
            input:-webkit-autofill,
            input:-webkit-autofill:hover,
            input:-webkit-autofill:focus,
            textarea:-webkit-autofill,
            textarea:-webkit-autofill:hover,
            textarea:-webkit-autofill:focus {
              -webkit-text-fill-color: #eaeaea !important;
              -webkit-box-shadow: 0 0 0px 1000px #0f0f0f inset !important;
              box-shadow: 0 0 0px 1000px #0f0f0f inset !important;
              transition: background-color 9999s ease-in-out 0s;
              caret-color: #eaeaea;
            }
          `}</style>
        </main>
      );
    };
  }, []);

  // ===== Request state =====
  const [email, setEmail] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqMsg, setReqMsg] = useState("");
  const [reqOk, setReqOk] = useState(false);

  async function onRequest(e) {
    e?.preventDefault?.();
    if (reqLoading) return;

    setReqMsg("");
    setReqOk(false);

    const value = email.trim().toLowerCase();
    if (!value) return setReqMsg(t("requiredEmail"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setReqMsg(t("invalidEmail"));

    setReqLoading(true);
    try {
      const res = await apiFetch("/api/password_reset/request", {
        method: "POST",
        headers: { "accept-language": lang },
        body: { email: value },
      });

      if (res.status === 429) setReqMsg(t("rate"));
      else {
        setReqOk(true);
        setReqMsg(t("sentMsg"));
      }
    } catch {
      // enumeration-safe
      setReqOk(true);
      setReqMsg(t("sentMsg"));
    } finally {
      setReqLoading(false);
    }
  }

  // ===== Confirm state =====
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [confLoading, setConfLoading] = useState(false);
  const [confMsg, setConfMsg] = useState("");
  const [confOk, setConfOk] = useState(false);

  async function onConfirm(e) {
    e?.preventDefault?.();
    if (confLoading) return;

    setConfMsg("");
    setConfOk(false);

    if (!token) return setConfMsg(t("server"));
    if (pw1.length < 8) return setConfMsg(t("short"));
    if (pw1 !== pw2) return setConfMsg(t("mismatch"));

    setConfLoading(true);
    try {
      const res = await apiFetch("/api/password_reset/confirm", {
        method: "POST",
        body: { token, password: pw1 },
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) setConfMsg(t("rate"));
      else if (res.ok && data?.success) {
        setConfOk(true);
        setConfMsg(t("ok"));
      } else {
        setConfMsg((typeof data?.error === "string" && data.error) || t("server"));
      }
    } catch {
      setConfMsg(t("server"));
    } finally {
      setConfLoading(false);
      setPw1("");
      setPw2("");
    }
  }

  const helper = !csrfReady ? (
    <div className="text-sm text-gray-400 mb-3" role="status" aria-live="polite">
      {t("processing")}
    </div>
  ) : null;

  // ===== RENDER =====
  if (mode === "request") {
    return (
      <Card>
        <h1 className="text-xl font-extrabold text-[#d1ffd0] mb-5">{t("requestTitle")}</h1>
        {helper}

        <form onSubmit={onRequest} noValidate>
          <label className="sr-only" htmlFor="email">
            {t("emailPlaceholder")}
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={reqLoading}
            required
          />

          {reqMsg && (
            <div className={`mt-3 text-sm ${reqOk ? "text-green-400" : "text-red-400"}`} role={reqOk ? "status" : "alert"}>
              {reqMsg}
            </div>
          )}

          <button type="submit" disabled={reqLoading || !csrfReady} className={buttonClass}>
            {reqLoading ? t("sending") : t("sendBtn")}
          </button>

          <div className="text-center mt-4">
            <Link href="/login" className="text-[#81d742] underline underline-offset-4">
              {t("loginLink")}
            </Link>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-xl font-extrabold text-[#d1ffd0] mb-5">{t("confirmTitle")}</h1>
      {helper}

      <form onSubmit={onConfirm} noValidate>
        <div className="mb-3">
          <label className="sr-only" htmlFor="new_password">
            {t("newPw")}
          </label>
          <input
            id="new_password"
            type="password"
            placeholder={t("newPwPh")}
            autoComplete="new-password"
            className={inputClass}
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            disabled={confLoading}
            required
          />
        </div>

        <div className="mb-1">
          <label className="sr-only" htmlFor="new_password_repeat">
            {t("newPwRpt")}
          </label>
          <input
            id="new_password_repeat"
            type="password"
            placeholder={t("newPwRptPh")}
            autoComplete="new-password"
            className={inputClass}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            disabled={confLoading}
            required
          />
        </div>

        {confMsg && (
          <div className={`mt-3 text-sm ${confOk ? "text-green-400" : "text-red-400"}`} role={confOk ? "status" : "alert"}>
            {confMsg}
          </div>
        )}

        <button type="submit" disabled={confLoading || !csrfReady} className={buttonClass}>
          {confLoading ? t("processing") : t("saveBtn")}
        </button>

        <div className="text-center mt-4">
          <Link href="/login" className="text-[#81d742] underline underline-offset-4">
            {t("loginLink")}
          </Link>
        </div>
      </form>
    </Card>
  );
}
