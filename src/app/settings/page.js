'use client';

import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import { useUser } from "@/context/UserContext";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCsrfToken } from "@/hooks/useCsrfToken";

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Türkçe' }
];

const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'TRY', symbol: '₺', name: 'Türk Lirası' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    language_preference: "en",
    currencyCode: "EUR",
    current_password: "",
    new_password: "",
    new_password_repeat: ""
  });
  const [message, setMessage] = useState("");
  const msgRef = useRef(null);
  const { user } = useUser();
  const { locale, setLocale } = useLocale();
  const t = useTranslation();
  const isMobile = useIsMobile();
  const csrfToken = useCsrfToken();

  // Kartların spacing ayarı
  const cardGap = isMobile ? "gap-6" : "gap-7";

  // Kart classlarını tek değişkende topladık, iki kart da aynı görünecek
  const cardClass = `
    flex-1 min-w-[220px] max-w-[380px]
    bg-[#191919] rounded-2xl shadow-md border border-[#232323]
    flex flex-col gap-3 px-6 pb-7 pt-6
    mx-auto
  `;

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        setProfile(prev => ({
          ...prev,
          name: data.name || "",
          email: data.email || "",
          language_preference: data.language_preference || "en",
          currencyCode: data.currencyCode || "EUR",
        }));
        setLocale(data.language_preference || "en");
        setLoading(false);
      });
    // eslint-disable-next-line
  }, []);

  // Message kartlara yakın gözüksün ve otomatik kaybolsun
  useEffect(() => {
    if (message && msgRef.current) {
      msgRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(() => setMessage(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [message]);

  function handleChange(e) {
    setProfile(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    if (e.target.name === "language_preference") {
      setLocale(e.target.value);
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    setMessage("");

    // Profil güncelleme
    const profileRes = await fetch("/api/settings/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        name: profile.name,
        language_preference: profile.language_preference,
        currencyCode: profile.currencyCode,
      }),
    });
    const profileData = await profileRes.json();

    // Şifre alanı doluysa şifre güncelleme
    let passwordMsg = "";
    if (profile.current_password && profile.new_password && profile.new_password_repeat) {
      if (profile.new_password !== profile.new_password_repeat) {
        setMessage(t("passwordNoMatch"));
        return;
      }
      const passwordRes = await fetch("/api/settings/change_password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          current_password: profile.current_password,
          new_password: profile.new_password
        }),
      });
      const passwordData = await passwordRes.json();
      if (passwordRes.status === 429) {
        passwordMsg = t("tooManyRequests") || "Too many attempts";
      } else {
        passwordMsg = passwordData.success
          ? t("passwordChanged")
          : (passwordData.error || t("errorGeneric"));
      }
    }

    // Profil mesajı
    if (profileRes.status === 429) {
      setMessage(t("tooManyRequests") || "Too many requests");
    } else {
      setMessage(
        (profileData.success ? t("profileUpdated") : profileData.error || t("errorGeneric")) +
        (passwordMsg ? " • " + passwordMsg : "")
      );
    }

    // Şifre alanlarını temizle
    setProfile(prev => ({
      ...prev,
      current_password: "",
      new_password: "",
      new_password_repeat: ""
    }));
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

  return (
    <Layout>
      <main className={`flex flex-col items-center w-full max-w-3xl mx-auto flex-1 justify-center mt-8 ${isMobile ? 'gap-6' : 'gap-8'} px-2`}>
        <form onSubmit={handleSave} className={`flex flex-col ${cardGap} w-full md:flex-row`}>
          {/* Profil Kartı */}
          <div className={cardClass}>
            <h3 className="font-extrabold text-lg mb-2 text-[#81d742] font-mono text-center">{t("profileInfo")}</h3>
            <label className="text-xs font-mono font-semibold text-gray-300">{t("name")}</label>
            <input
              type="text"
              name="name"
              value={profile.name}
              onChange={handleChange}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
              required
            />
            <label className="text-xs font-mono font-semibold text-gray-300">{t("language")}</label>
            <select
              name="language_preference"
              value={profile.language_preference}
              onChange={handleChange}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <label className="text-xs font-mono font-semibold text-gray-300">{t("currency")}</label>
            <select
              name="currencyCode"
              value={profile.currencyCode}
              onChange={handleChange}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
            >
              {CURRENCIES.map(cur => (
                <option key={cur.code} value={cur.code}>{cur.name} ({cur.symbol})</option>
              ))}
            </select>
            {/* Profil güncelleme mesajı */}
            {message && (
              <div ref={msgRef} className="text-[#81d742] font-semibold mt-3 text-center max-w-2xl transition-opacity duration-500">
                {message}
              </div>
            )}
          </div>
          {/* Şifre Kartı */}
          <div className={cardClass}>
            <h3 className="font-extrabold text-lg mb-2 text-[#81d742] font-mono text-center">{t("changePassword")}</h3>
            <label className="text-xs font-mono font-semibold text-gray-300">{t("currentPassword")}</label>
            <input
              type="password"
              name="current_password"
              value={profile.current_password}
              onChange={handleChange}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
            />
            <label className="text-xs font-mono font-semibold text-gray-300">{t("newPassword")}</label>
            <input
              type="password"
              name="new_password"
              value={profile.new_password}
              onChange={handleChange}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
            />
            <label className="text-xs font-mono font-semibold text-gray-300">{t("repeatNewPassword")}</label>
            <input
              type="password"
              name="new_password_repeat"
              value={profile.new_password_repeat}
              onChange={handleChange}
              className="bg-[#222] border border-[#444] focus:border-[#81d742] rounded-md px-3 py-2 text-white text-sm"
            />
          </div>
        </form>
        {/* Save Button */}
        <button
          type="submit"
          onClick={handleSave}
          disabled={!csrfToken}
          className="w-full max-w-xs py-3 font-bold text-lg bg-[#81d742] text-[#181818] rounded-lg shadow hover:bg-[#a9ff72] transition mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ marginBottom: "8px" }}
        >
          {t("saveChanges")}
        </button>
      </main>
    </Layout>
  );
}
