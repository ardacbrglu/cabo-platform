// src/app/settings/page.jsx
"use client";

/**
 * Settings — PROD (autosave + robust messaging)
 * - Dil & Para birimi: debounce autosave
 * - Same-site CSRF fallback'e uygun akış
 * - Autofill mavi arka plan fix
 */

import { useState, useEffect, useRef, useMemo } from "react";
import Layout from "@/components/Layout";
import CustomSelect from "@/components/CustomSelect";
import { useLocale } from "@/context/LocaleContext";
import useTranslation from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";
import apiFetch from "@/lib/apiFetch";

const INPUT_CLASS =
  "settings-input bg-[#1f1f1f] border border-[#323232] focus:border-[#81d742] focus:ring-0 rounded-md px-3 py-2 text-white text-sm placeholder:text-gray-400 outline-none";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [currencies, setCurrencies] = useState([]);
  const [languages, setLanguages] = useState([]);

  const [profile, setProfile] = useState({
    name: "",
    email: "",
    languagePreference: "tr",
    currencyCode: "TRY",
    current_password: "",
    new_password: "",
    new_password_repeat: "",
  });

  // Sunucudan gelen son değerler (diff/dirty kontrolü)
  const baselineRef = useRef({
    name: "",
    languagePreference: "tr",
    currencyCode: "TRY",
  });

  // mesaj + tipi
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState("success"); // "success" | "error" | "warn"
  const [pwHint, setPwHint] = useState("");
  const msgRef = useRef(null);

  // autosave zamanlayıcıları
  const saveTimers = useRef({ lang: null, curr: null, name: null });
  const inflightRef = useRef(false);

  const { setLocale } = useLocale();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const mapErrorKey = (key) => {
    switch (key) {
      case "too_many": return t("tooManyRequests") || "Too many requests";
      case "unauthorized": return t("notLoggedIn") || "Unauthorized";
      case "csrf": return t("errorGeneric") || "Invalid CSRF token";
      case "invalid_payload": return t("errorGeneric") || "Invalid payload";
      case "unsupported_media": return t("errorGeneric") || "Unsupported Media Type";
      case "invalid_input": return t("errorGeneric") || "Invalid input";
      case "server": return t("serverError") || "Server error";
      case "weak": return t("passwordTooShort") || "Password too weak";
      case "must_different": return t("errorGeneric") || "New password must be different";
      case "no_password_nowarn": return t("hybridPasswordHint") || "No current password needed";
      case "current_required": return t("allFieldsRequired") || "Current password required";
      case "current_wrong": return t("errorGeneric") || "Current password is incorrect";
      default: return t("errorGeneric") || "Error";
    }
  };

  async function parseJsonSafe(res) { try { return await res.json(); } catch { return null; } }

  // İlk veri yükü
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // currencies
        let cur = [{ value: "TRY", label: "₺ Türk Lirası" }];
        try {
          const res = await apiFetch("/api/currencies", { method: "GET" });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.currencies) && data.currencies.length > 0) cur = data.currencies;
          }
        } catch {}
        if (!mounted) return;
        setCurrencies(cur);

        // languages
        let langs = [
          { value: "tr", label: "Türkçe" },
          { value: "en", label: "English" },
        ];
        try {
          const res = await apiFetch("/api/languages", { method: "GET" });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.languages) && data.languages.length > 0) langs = data.languages;
          }
        } catch {}
        if (!mounted) return;
        setLanguages(langs);

        // me
        const resp = await apiFetch("/api/me", { method: "GET" });
        if (!resp.ok) {
          setMsgType("error");
          setMessage(t("unauthorized") || "Unauthorized");
          setLoading(false);
          return;
        }
        const data = await resp.json();
        if (!mounted) return;

        const lang = (data.languagePreference || (langs[0] && langs[0].value) || "tr").toLowerCase();
        const curCode = (data.currencyCode || (cur[0] && cur[0].value) || "TRY").toUpperCase();

        setProfile(prev => ({
          ...prev,
          name: data.name || "",
          email: data.email || "",
          languagePreference: lang,
          currencyCode: curCode,
          current_password: "",
          new_password: "",
          new_password_repeat: "",
        }));

        baselineRef.current = {
          name: data.name || "",
          languagePreference: lang,
          currencyCode: curCode,
        };

        setLocale(lang);
        setLoading(false);
      } catch {
        if (!mounted) return;
        setMsgType("error");
        setMessage(t("errorGeneric") || "An error occurred");
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mesaj scroll & auto-hide
  useEffect(() => {
    if (message && msgRef.current) {
      msgRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(() => { setMessage(""); setMsgType("success"); }, 2200);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Debounced autosave helper
  const debouncedAutoSave = (key, delay = 250) => {
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      saveTimers.current[key] = null;
      await autoSave();
    }, delay);
  };

  // Profil autosave (name/lang/currency tamamını gönderir)
  async function autoSave() {
    const b = baselineRef.current;
    const changed =
      profile.name.trim() !== b.name.trim() ||
      profile.languagePreference !== b.languagePreference ||
      profile.currencyCode !== b.currencyCode;

    if (!changed) return;
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const res = await apiFetch("/api/settings/update", {
        method: "POST",
        body: {
          name: profile.name,
          languagePreference: profile.languagePreference, // lower
          currencyCode: profile.currencyCode,             // upper
        },
      });
      const data = await parseJsonSafe(res);

      if (res.ok && !data?.errorKey) {
        baselineRef.current = {
          name: profile.name,
          languagePreference: profile.languagePreference,
          currencyCode: profile.currencyCode,
        };
        setMsgType("success");
        setMessage(data?.noChange ? (t("noChanges") || "No changes to save.") : (t("profileUpdated") || "Profile updated"));
      } else {
        const key = data?.errorKey;
        setMsgType("warn");
        setMessage(key ? mapErrorKey(key) : (t("errorGeneric") || "Error"));
      }
    } catch {
      setMsgType("warn");
      setMessage(t("errorGeneric") || "An error occurred");
    } finally {
      inflightRef.current = false;
    }
  }

  function handleChange(field, value) {
    const v = field === "languagePreference" ? String(value || "").toLowerCase()
            : field === "currencyCode"       ? String(value || "").toUpperCase()
            : value;

    setProfile(prev => ({ ...prev, [field]: v }));

    if (field === "languagePreference") {
      setLocale(v);
      debouncedAutoSave("lang");
    } else if (field === "currencyCode") {
      debouncedAutoSave("curr");
    } else if (field === "name") {
      debouncedAutoSave("name", 500);
    }

    if (field === "new_password" || field === "new_password_repeat") {
      const np = field === "new_password" ? v : profile.new_password;
      const nr = field === "new_password_repeat" ? v : profile.new_password_repeat;
      if (profile.current_password === "" && (np?.length || nr?.length)) {
        setPwHint(t("hybridPasswordHint") || "If you registered with Google, you can set a password without current one.");
      } else if (np !== nr) {
        setPwHint(t("passwordNoMatch") || "Passwords do not match");
      } else if ((np || "").length > 0 && (np || "").length < 8) {
        setPwHint(t("passwordTooShort") || "Password must be at least 8 characters.");
      } else {
        setPwHint("");
      }
    }
  }

  const hasProfileChanges = useMemo(() => {
    const b = baselineRef.current;
    return (
      profile.name.trim() !== b.name.trim() ||
      profile.languagePreference !== b.languagePreference ||
      profile.currencyCode !== b.currencyCode
    );
  }, [profile.name, profile.languagePreference, profile.currencyCode]);

  async function handleSave(e) {
    if (e) e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    setMsgType("success");

    try {
      // Şifre değişikliği?
      const wantsPasswordChange =
        !!profile.new_password || !!profile.new_password_repeat || !!profile.current_password;

      // Profilde değişiklik varsa önce onu kaydet
      if (hasProfileChanges) {
        await autoSave();
      }

      // Şifre
      let pwdMsg = "";
      let pwdSucceeded = false;
      if (wantsPasswordChange) {
        if (!profile.new_password || !profile.new_password_repeat) {
          pwdMsg = t("allFieldsRequired") || "All fields are required.";
        } else if (profile.new_password !== profile.new_password_repeat) {
          pwdMsg = t("passwordNoMatch") || "Passwords do not match";
        } else if ((profile.new_password || "").length < 8) {
          pwdMsg = t("passwordTooShort") || "Password must be at least 8 characters.";
        } else {
          const passwordRes = await apiFetch("/api/settings/change_password", {
            method: "POST",
            body: {
              current_password: profile.current_password,
              new_password: profile.new_password,
            },
          });
          const passwordData = await parseJsonSafe(passwordRes);

          if (passwordRes.status === 429) {
            pwdMsg = t("tooManyRequests") || "Too many attempts";
          } else if (passwordRes.ok && (passwordData?.success || passwordData?.firstTimeSet)) {
            pwdMsg = passwordData?.firstTimeSet
              ? (t("passwordSetSuccess") || "Password set!")
              : (t("passwordChanged") || "Password changed");
            pwdSucceeded = true;
          } else {
            const key = passwordData?.errorKey;
            pwdMsg = key ? mapErrorKey(key) : (t("errorGeneric") || "Error");
          }
        }
      }

      // Mesaj tonları
      if (wantsPasswordChange) {
        setMsgType(pwdSucceeded ? "success" : "warn");
        setMessage(pwdMsg);
      } else if (!hasProfileChanges) {
        setMsgType("warn");
        setMessage(t("noChanges") || "No changes to save.");
      }
    } catch {
      setMsgType("error");
      setMessage(t("errorGeneric") || "An error occurred");
    } finally {
      setSubmitting(false);
      setProfile(prev => ({
        ...prev,
        current_password: "",
        new_password: "",
        new_password_repeat: "",
      }));
      setPwHint("");
    }
  }

  if (loading) {
    return (
      <Layout>
        <main id="cabo-main" className="flex justify-center items-center min-h-[60vh] px-3">
          <div className="text-center">
            <h2 className="text-lg font-bold mb-1">{t("settings")}</h2>
            <p className="text-gray-400">{t("loading")}</p>
          </div>
        </main>
      </Layout>
    );
  }

  const cardBase =
    "relative bg-[#191919] rounded-2xl shadow-md border border-[#232323] flex flex-col gap-3 px-6 py-6 w-full overflow-visible";

  const msgColor =
    msgType === "error" ? "text-red-400" : msgType === "warn" ? "text-yellow-300" : "text-[#81d742]";

  return (
    <Layout>
      <main id="cabo-main" className="isolate w-full max-w-4xl mx-auto px-3 py-8">
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7" autoComplete="off">
          {/* Profil Kartı */}
          <div className={`${cardBase} z-40`}>
            <h3 className="font-extrabold text-lg mb-2 text-[#81d742] font-mono text-center">
              {t("profileInfo")}
            </h3>

            <label className="text-xs font-mono font-semibold text-gray-300">{t("name")}</label>
            <input
              type="text"
              name="display_name"
              value={profile.name}
              onChange={(e) => handleChange("name", e.target.value)}
              onBlur={() => debouncedAutoSave("name", 0)}
              className={INPUT_CLASS}
              required
              autoComplete="off"
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("language")}</label>
            <div className="relative z-40 focus-within:z-[9999]">
              <CustomSelect
                options={languages}
                value={profile.languagePreference}
                onChange={(v) => handleChange("languagePreference", v)}
              />
            </div>

            <label className="text-xs font-mono font-semibold text-gray-300">{t("currency")}</label>
            <div className="relative z-20 focus-within:z-[9999]">
              <CustomSelect
                options={currencies}
                value={profile.currencyCode}
                onChange={(v) => handleChange("currencyCode", v)}
              />
            </div>

            {message ? (
              <div
                ref={msgRef}
                className={`${msgColor} font-semibold mt-3 text-center transition-opacity duration-500`}
                role={msgType === "error" ? "alert" : "status"}
                aria-live={msgType === "error" ? "assertive" : "polite"}
              >
                {message}
              </div>
            ) : null}
          </div>

          {/* Şifre Kartı */}
          <div className={`${cardBase} z-10`}>
            <h3 className="font-extrabold text-lg mb-2 text-[#81d742] font-mono text-center">
              {t("changePassword")}
            </h3>

            {/* Autofill kırıcı dummy alanlar */}
            <input type="text" className="hidden" name="username" autoComplete="username" />
            <input type="password" className="hidden" name="new-password-dummy" autoComplete="new-password" />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("currentPassword")}</label>
            <input
              type="password"
              name="current_password_ignored"
              value={profile.current_password}
              onChange={(e) => handleChange("current_password", e.target.value)}
              className={INPUT_CLASS}
              autoComplete="off"
              placeholder={t("currentPasswordPlaceholder") || ""}
              inputMode="text"
              data-lpignore="true"
              data-1p-ignore="true"
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("newPassword")}</label>
            <input
              type="password"
              name="new_password"
              value={profile.new_password}
              onChange={(e) => handleChange("new_password", e.target.value)}
              className={INPUT_CLASS}
              autoComplete="new-password"
              placeholder={t("newPasswordPlaceholder") || ""}
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("repeatNewPassword")}</label>
            <input
              type="password"
              name="new_password_repeat"
              value={profile.new_password_repeat}
              onChange={(e) => handleChange("new_password_repeat", e.target.value)}
              className={INPUT_CLASS}
              autoComplete="new-password"
              placeholder={t("repeatNewPasswordPlaceholder") || ""}
            />

            <div className="min-h-5 text-[12px] mt-1 text-center">
              {pwHint ? (
                <span className="text-[#ffd66b]">{pwHint}</span>
              ) : (
                <span className="text-gray-400">
                  {t("hybridPasswordHint") ||
                    "If you signed up with Google, you can set a classic password. Leave current password empty if setting for the first time."}
                </span>
              )}
            </div>
          </div>

          {/* Kaydet */}
          <div className="md:col-span-2 flex justify-center">
            <button
              type="submit"
              disabled={submitting}
              className="w-full md:max-w-xs py-3 font-bold text-lg bg-[#81d742] text-[#181818] rounded-lg shadow hover:bg-[#a9ff72] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (t("saving") || "Saving…") : t("saveChanges")}
            </button>
          </div>
        </form>
      </main>

      {/* Autofill mavi arka plan fix */}
      <style jsx global>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0px 1000px #1f1f1f inset !important;
          -webkit-text-fill-color: #ffffff !important;
          caret-color: #ffffff;
        }
      `}</style>
    </Layout>
  );
}
