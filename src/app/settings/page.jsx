"use client";

import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import CustomSelect from "@/components/CustomSelect";
import { useLocale } from "@/context/LocaleContext";
import useTranslation from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";
import apiFetch from "@/lib/apiFetch"; // tek wrapper

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
  const [message, setMessage] = useState("");
  const [pwHint, setPwHint] = useState(""); // canlı uyarı
  const msgRef = useRef(null);

  const { setLocale } = useLocale();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  // --- API errorKey -> t(key)
  const mapErrorKey = (key) => {
    switch (key) {
      case "too_many": return t("tooManyRequests") || "Too many requests";
      case "unauthorized": return t("notLoggedIn") || "Unauthorized";
      case "csrf": return t("errorGeneric") || "Invalid CSRF token";
      case "invalid_payload": return t("errorGeneric") || "Invalid payload";
      case "unsupported_media": return t("errorGeneric") || "Unsupported Media Type";
      case "invalid_input": return t("errorGeneric") || "Invalid input";
      case "server": return t("serverError") || "Server error";
      // password
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

        setProfile((prev) => ({
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
    setProfile((prev) => ({ ...prev, [field]: value }));
    if (field === "languagePreference") setLocale(value);

    // canlı şifre uyarıları
    if (field === "new_password" || field === "new_password_repeat") {
      if (profile.current_password === "" && (value?.length ?? 0) > 0) {
        setPwHint(t("hybridPasswordHint") || "If you registered with Google, you can set a password without current one.");
      } else if ((field === "new_password" ? value : profile.new_password) !== (field === "new_password_repeat" ? value : profile.new_password_repeat)) {
        setPwHint(t("passwordNoMatch") || "Passwords do not match");
      } else if (((field === "new_password" ? value : profile.new_password) || "").length > 0 && ((field === "new_password" ? value : profile.new_password) || "").length < 8) {
        setPwHint(t("passwordTooShort") || "Password must be at least 8 characters.");
      } else {
        setPwHint("");
      }
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");

    try {
      // profil
      const profileRes = await apiFetch("/api/settings/update", {
        method: "POST",
        body: {
          name: profile.name,
          languagePreference: profile.languagePreference,
          currencyCode: profile.currencyCode,
        },
      });
      const profileData = await profileRes.json().catch(() => ({}));

      // şifre (opsiyonel)
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
          passwordMsg = passwordData.errorKey
            ? mapErrorKey(passwordData.errorKey)
            : (t("errorGeneric") || "Error");
        }
      }

      // sonuç mesajı
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
      setProfile((prev) => ({
        ...prev,
        current_password: "",
        new_password: "",
        new_password_repeat: ""
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

  // Kart ortak stilleri – dikkat: z-index; soldaki karta yüksek z veriyoruz
  const cardBase =
    "relative bg-[#191919] rounded-2xl shadow-md border border-[#232323] flex flex-col gap-3 px-6 pb-6 pt-6 w-full";

  return (
    <Layout>
      {/* isolate: dropdown'lar sibling üstüne rahat çıksın */}
      <main
        id="cabo-main"
        className="isolate w-full max-w-4xl mx-auto px-3 py-8"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7">
          {/* Profil Kartı (z yüksek) */}
          <div className={`${cardBase} z-40`}>
            <h3 className="font-extrabold text-lg mb-2 text-[#81d742] font-mono text-center">
              {t("profileInfo")}
            </h3>

            <label className="text-xs font-mono font-semibold text-gray-300">{t("name")}</label>
            <input
              type="text"
              name="name"
              value={profile.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className={INPUT_CLASS}
              required
              autoComplete="name"
            />

            <label className="text-xs font-mono font-semibold text-gray-300">{t("language")}</label>
            {/* dropdown daha yukarıda olsun diye wrapper'a z-index */}
            <div className="relative z-50">
              <CustomSelect
                options={languages}
                value={profile.languagePreference}
                onChange={(v) => handleChange("languagePreference", v)}
              />
            </div>

            <label className="text-xs font-mono font-semibold text-gray-300">{t("currency")}</label>
            <div className="relative z-50">
              <CustomSelect
                options={currencies}
                value={profile.currencyCode}
                onChange={(v) => handleChange("currencyCode", v)}
              />
            </div>

            {message ? (
              <div
                ref={msgRef}
                className="text-[#81d742] font-semibold mt-3 text-center max-w-2xl transition-opacity duration-500"
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

            <label className="text-xs font-mono font-semibold text-gray-300">{t("currentPassword")}</label>
            <input
              type="password"
              name="current_password"
              value={profile.current_password}
              onChange={(e) => handleChange("current_password", e.target.value)}
              className={INPUT_CLASS}
              autoComplete="current-password"
              placeholder={t("currentPasswordPlaceholder") || ""}
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

            {/* Canlı uyarı/ipuçları */}
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
    </Layout>
  );
}
