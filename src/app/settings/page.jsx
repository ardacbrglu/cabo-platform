// src/app/settings/page.jsx
"use client";

import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import CustomSelect from "@/components/CustomSelect";
import { useLocale } from "@/context/LocaleContext";
import useTranslation from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";
import apiFetch from "@/lib/apiFetch"; // tek wrapper

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
  const [message, setMessage] = useState("");
  const msgRef = useRef(null);

  const { setLocale } = useLocale();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  // --- küçük yardımcı: API errorKey -> t(key) map
  const mapErrorKey = (key) => {
    switch (key) {
      case "too_many": return t("tooManyRequests") || "Too many requests";
      case "unauthorized": return t("notLoggedIn") || "Unauthorized";
      case "csrf": return t("errorGeneric") || "Invalid CSRF token";
      case "invalid_payload": return t("errorGeneric") || "Invalid payload";
      case "unsupported_media": return t("errorGeneric") || "Unsupported Media Type";
      case "invalid_input": return t("errorGeneric") || "Invalid input";
      case "server": return t("serverError") || "Server error";

      // password spesifik
      case "weak": return t("passwordTooShort") || "Password too weak";
      case "must_different": return t("errorGeneric") || "New password must be different";
      case "no_password_nowarn": return t("hybridPasswordHint") || "No current password needed";
      case "current_required": return t("allFieldsRequired") || "Current password required";
      case "current_wrong": return t("errorGeneric") || "Current password is incorrect";

      default: return t("errorGeneric") || "Error";
    }
  };

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
          setMessage(t("unauthorized") || "Unauthorized");
          setLoading(false);
          return;
        }
        const data = await resp.json();
        if (!mounted) return;

        setProfile(prev => ({
          ...prev,
          name: data.name || "",
          email: data.email || "",
          languagePreference: data.languagePreference || (langs[0] && langs[0].value) || "tr",
          currencyCode: data.currencyCode || (cur[0] && cur[0].value) || "TRY",
        }));
        setLocale(data.languagePreference || (langs[0] && langs[0].value) || "tr");
        setLoading(false);
      } catch {
        if (!mounted) return;
        setMessage(t("errorGeneric") || "An error occurred");
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (message && msgRef.current) {
      msgRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(() => setMessage(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [message]);

  function handleChange(field, value) {
    setProfile(prev => ({ ...prev, [field]: value }));
    if (field === "languagePreference") setLocale(value);
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");

    try {
      // --- profile update
      const profileRes = await apiFetch("/api/settings/update", {
        method: "POST",
        body: {
          name: profile.name,
          languagePreference: profile.languagePreference,
          currencyCode: profile.currencyCode,
        },
      });
      const profileData = await profileRes.json().catch(() => ({}));

      // --- password (opsiyonel)
      let passwordMsg = "";
      const wantsPasswordChange =
        profile.new_password || profile.new_password_repeat || profile.current_password;

      if (wantsPasswordChange) {
        if (!profile.new_password || !profile.new_password_repeat) {
          setMessage(t("allFieldsRequired") || "All fields are required.");
          setSubmitting(false);
          return;
        }
        if (profile.new_password !== profile.new_password_repeat) {
          setMessage(t("passwordNoMatch") || "Passwords do not match");
          setSubmitting(false);
          return;
        }
        if ((profile.new_password || "").length < 8) {
          setMessage(t("passwordTooShort") || "Password must be at least 8 characters.");
          setSubmitting(false);
          return;
        }

        const passwordRes = await apiFetch("/api/settings/change_password", {
          method: "POST",
          body: {
            current_password: profile.current_password,
            new_password: profile.new_password,
          },
        });
        const passwordData = await passwordRes.json().catch(() => ({}));

        if (passwordRes.status === 429) {
          passwordMsg = t("tooManyRequests") || "Too many attempts";
        } else if (passwordData.firstTimeSet) {
          passwordMsg = t("passwordSetSuccess") || "Password set!";
        } else if (passwordData.success) {
          passwordMsg = t("passwordChanged") || "Password changed";
        } else {
          // errorKey varsa çevir, yoksa generic
          passwordMsg = passwordData.errorKey
            ? mapErrorKey(passwordData.errorKey)
            : (t("errorGeneric") || "Error");
        }
      }

      // --- sonuç mesajı (profil + şifre)
      if (profileRes.status === 429) {
        setMessage(t("tooManyRequests") || "Too many requests");
      } else if (!profileRes.ok) {
        const errMsg = profileData.errorKey
          ? mapErrorKey(profileData.errorKey)
          : (t("errorGeneric") || "Error");
        setMessage(errMsg + (passwordMsg ? " • " + passwordMsg : ""));
      } else {
        setMessage(
          (profileData.success ? (t("profileUpdated") || "Profile updated") : (t("errorGeneric") || "Error")) +
          (passwordMsg ? " • " + passwordMsg : "")
        );
      }
    } catch {
      setMessage(t("errorGeneric") || "An error occurred");
    } finally {
      setSubmitting(false);
      setProfile(prev => ({
        ...prev,
        current_password: "",
        new_password: "",
        new_password_repeat: ""
      }));
    }
  }

  if (loading) {
    return (
      <Layout>
        <main className="flex justify-center items-center min-h-[70vh]">
          <div>
            <h2>{t("settings")}</h2>
            <p>{t("loading")}</p>
          </div>
        </main>
      </Layout>
    );
  }

  const cardGap = isMobile ? "gap-6" : "gap-7";
  const cardClass = `
    flex-1 min-w-[220px] max-w-[380px]
    bg-[#191919] rounded-2xl shadow-md border border-[#232323]
    flex flex-col gap-3 px-6 pb-7 pt-6
    mx-auto
  `;

  return (
    <Layout>
      <main className={`flex flex-col items-center w-full max-w-3xl mx-auto flex-1 justify-center mt-8 ${isMobile ? "gap-6" : "gap-8"} px-2`}>
        <form onSubmit={handleSave} className={`flex flex-col ${cardGap} w-full md:flex-row`}>
          {/* Profil Kartı */}
          <div className={cardClass}>
            <h3 className="font-extrabold text-lg mb-2 text-[#81d742] font-mono text-center">{t("profileInfo")}</h3>

            <label className="text-xs font-mono font-semibold text-gray-300">{t("name")}</label>
            <input
              type="text"
              name="name"
              value={profile.name}
              onChange={e => handleChange("name", e.target.value)}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
              required
              autoComplete="name"
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("language")}</label>
            <CustomSelect
              options={languages}
              value={profile.languagePreference}
              onChange={v => handleChange("languagePreference", v)}
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("currency")}</label>
            <CustomSelect
              options={currencies}
              value={profile.currencyCode}
              onChange={v => handleChange("currencyCode", v)}
            />

            {message ? (
              <div ref={msgRef} className="text-[#81d742] font-semibold mt-3 text-center max-w-2xl transition-opacity duration-500">
                {message}
              </div>
            ) : null}
          </div>

          {/* Şifre Kartı */}
          <div className={cardClass}>
            <h3 className="font-extrabold text-lg mb-2 text-[#81d742] font-mono text-center">{t("changePassword")}</h3>

            <label className="text-xs font-mono font-semibold text-gray-300">{t("currentPassword")}</label>
            <input
              type="password"
              name="current_password"
              value={profile.current_password}
              onChange={e => handleChange("current_password", e.target.value)}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
              autoComplete="current-password"
              placeholder={t("currentPasswordPlaceholder") || ""}
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("newPassword")}</label>
            <input
              type="password"
              name="new_password"
              value={profile.new_password}
              onChange={e => handleChange("new_password", e.target.value)}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
              autoComplete="new-password"
              placeholder={t("newPasswordPlaceholder") || ""}
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("repeatNewPassword")}</label>
            <input
              type="password"
              name="new_password_repeat"
              value={profile.new_password_repeat}
              onChange={e => handleChange("new_password_repeat", e.target.value)}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
              autoComplete="new-password"
              placeholder={t("repeatNewPasswordPlaceholder") || ""}
            />

            <div className="text-xs text-gray-400 mt-1 mb-2">
              {t("hybridPasswordHint") ||
                "If you signed up with Google, you can now set a classic password. Leave current password empty if setting for the first time."}
            </div>
          </div>
        </form>

        <button
          type="submit"
          onClick={handleSave}
          disabled={submitting}
          className="w-full max-w-xs py-3 font-bold text-lg bg-[#81d742] text-[#181818] rounded-lg shadow hover:bg-[#a9ff72] transition mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ marginBottom: "8px" }}
        >
          {submitting ? (t("saving") || "Saving…") : t("saveChanges")}
        </button>
      </main>
    </Layout>
  );
}
