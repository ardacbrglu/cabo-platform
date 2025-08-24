// src/app/password_reset/Content.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";

// Yerel sözlük (public sayfa, merkezi i18n kullanılmıyor)
const translations = {
  en: {
    // REQUEST (email)
    requestTitle: "Reset your password",
    emailPlaceholder: "Email",
    sendBtn: "Send",
    sending: "Sending...",
    sentMsg: "If an account exists, we've emailed a reset link.",
    invalidEmail: "Please enter a valid email address.",
    requiredEmail: "Please fill out all fields.",
    rate: "Too many attempts. Please try again.",

    // CONFIRM (new password)
    confirmTitle: "Set a new password",
    newPw: "New Password",
    newPwPh: "New password (min 8 characters)",
    newPwRpt: "Repeat New Password",
    newPwRptPh: "Repeat new password",
    saveBtn: "Set Password",
    processing: "Processing...",
    short: "Password must be at least 8 characters.",
    mismatch: "Passwords do not match!",
    ok: "Password set!",
    server: "Server error. Please try again.",
    loginLink: "Go to login page",
  },
  tr: {
    // REQUEST (email)
    requestTitle: "Şifreni sıfırla",
    emailPlaceholder: "E-posta",
    sendBtn: "Gönder",
    sending: "Gönderiliyor...",
    sentMsg: "Hesap varsa şifre sıfırlama bağlantısı e-posta ile gönderildi.",
    invalidEmail: "Lütfen geçerli bir e-posta adresi girin.",
    requiredEmail: "Lütfen tüm alanları doldurun.",
    rate: "Çok fazla deneme. Lütfen tekrar deneyin.",

    // CONFIRM (new password)
    confirmTitle: "Yeni şifre belirle",
    newPw: "Yeni Şifre",
    newPwPh: "Yeni şifre (min 8 karakter)",
    newPwRpt: "Yeni Şifre (tekrar)",
    newPwRptPh: "Yeni şifreyi tekrar girin",
    saveBtn: "Şifreyi Güncelle",
    processing: "İşleniyor...",
    short: "Şifre en az 8 karakter olmalıdır.",
    mismatch: "Şifreler eşleşmiyor!",
    ok: "Şifreniz güncellendi!",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    loginLink: "Giriş sayfasına git",
  },
};

export default function PasswordResetContent({ token, initialLang }) {
  // Dil tespiti: ?lang=tr|en > navigator.language (tr başlıyorsa tr) > en
  const guessed =
    (initialLang && initialLang.toLowerCase().startsWith("tr")) ||
    (typeof navigator !== "undefined" &&
      String(navigator.language || "").toLowerCase().startsWith("tr"))
      ? "tr"
      : "en";
  const [lang] = useState(guessed);
  const dict = translations[lang] || translations.en;
  const t = (k) => (dict && k in dict ? dict[k] : k);

  // CSRF cookie preload (apiFetch header’ı ekler ama cookie hazır olsun)
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
    return () => { alive = false; };
  }, []);

  // Hangi form?
  const mode = token ? "confirm" : "request";

  /* =========================
     REQUEST: email formu
  ==========================*/
  const [email, setEmail] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqMsg, setReqMsg] = useState("");
  const [reqOk, setReqOk] = useState(false);

  async function onRequest(e) {
    e?.preventDefault?.();
    if (reqLoading) return;
    setReqMsg(""); setReqOk(false);

    const value = email.trim().toLowerCase();
    if (!value) { setReqMsg(t("requiredEmail")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setReqMsg(t("invalidEmail")); return; }

    setReqLoading(true);
    try {
      const res = await apiFetch("/api/password_reset/request", {
        method: "POST",
        headers: { "accept-language": lang },
        body: { email: value },
      });
      // Enumeration-safe: API her durumda success döner
      if (res.status === 429) setReqMsg(t("rate"));
      else { setReqOk(true); setReqMsg(t("sentMsg")); }
    } catch {
      setReqOk(true); setReqMsg(t("sentMsg")); // enumeration-safe
    } finally {
      setReqLoading(false);
    }
  }

  /* =========================
     CONFIRM: yeni şifre formu
  ==========================*/
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [confLoading, setConfLoading] = useState(false);
  const [confMsg, setConfMsg] = useState("");
  const [confOk, setConfOk] = useState(false);

  async function onConfirm(e) {
    e?.preventDefault?.();
    if (confLoading) return;

    setConfMsg(""); setConfOk(false);

    if (!token) { setConfMsg(t("server")); return; }
    if (pw1.length < 8) { setConfMsg(t("short")); return; }
    if (pw1 !== pw2) { setConfMsg(t("mismatch")); return; }

    setConfLoading(true);
    try {
      const res = await apiFetch("/api/password_reset/confirm", {
        method: "POST",
        body: { token, password: pw1 },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) setConfMsg(t("rate"));
      else if (res.ok && data?.success) { setConfOk(true); setConfMsg(t("ok")); }
      else setConfMsg((typeof data?.error === "string" && data.error) || t("server"));
    } catch {
      setConfMsg(t("server"));
    } finally {
      setConfLoading(false);
      setPw1(""); setPw2("");
    }
  }

  /* ---------- RENDER ---------- */
  if (mode === "request") {
    return (
      <main className="min-h-[70vh] flex items-center justify-center px-4">
        <form onSubmit={onRequest} className="bg-[#111] border border-[#232323] rounded-2xl p-8 w-full max-w-sm" noValidate>
          <h1 className="text-2xl font-extrabold text-[#d1ffd0] mb-6">{t("requestTitle")}</h1>

          {!csrfReady && (
            <div className="text-sm text-gray-400 mb-3" role="status" aria-live="polite">
              {t("processing")}
            </div>
          )}

          <label className="sr-only" htmlFor="email">{t("emailPlaceholder")}</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-white text-black border border-[#232323] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={reqLoading}
            required
          />

          {reqMsg && (
            <div className={`mt-3 text-sm ${reqOk ? "text-green-400" : "text-red-400"}`} role={reqOk ? "status" : "alert"} aria-live="assertive">
              {reqMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={reqLoading || !csrfReady}
            className="w-full mt-4 bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
          >
            {reqLoading ? t("sending") : t("sendBtn")}
          </button>

          <div className="text-center mt-4">
            <Link href="/login" className="text-[#81d742] underline">
              {t("loginLink")}
            </Link>
          </div>
        </form>
      </main>
    );
  }

  // mode === "confirm"
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <form onSubmit={onConfirm} className="bg-[#111] border border-[#232323] rounded-2xl p-8 w-full max-w-sm" noValidate>
        <h1 className="text-2xl font-extrabold text-[#d1ffd0] mb-6">{t("confirmTitle")}</h1>

        {!csrfReady && (
          <div className="text-sm text-gray-400 mb-3" role="status" aria-live="polite">
            {t("processing")}
          </div>
        )}

        <div className="mb-4">
          <label className="sr-only" htmlFor="new_password">{t("newPw")}</label>
          <input
            id="new_password"
            type="password"
            placeholder={t("newPwPh")}
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-lg bg-white text-black border border-[#232323] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            disabled={confLoading}
            required
          />
        </div>

        <div className="mb-2">
          <label className="sr-only" htmlFor="new_password_repeat">{t("newPwRpt")}</label>
          <input
            id="new_password_repeat"
            type="password"
            placeholder={t("newPwRptPh")}
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-lg bg-white text-black border border-[#232323] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            disabled={confLoading}
            required
          />
        </div>

        {confMsg && (
          <div className={`mt-2 text-sm ${confOk ? "text-green-400" : "text-red-400"}`} role={confOk ? "status" : "alert"} aria-live="assertive">
            {confMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={confLoading || !csrfReady}
          className="w-full mt-4 bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition disabled:opacity-60"
        >
          {confLoading ? t("processing") : t("saveBtn")}
        </button>

        <div className="text-center mt-4">
          <Link href="/login" className="text-[#81d742] underline">{t("loginLink")}</Link>
        </div>
      </form>
    </main>
  );
}
