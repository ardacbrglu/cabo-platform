"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MerchantLayout from "@/components/merchant/MerchantLayout";
import CustomSelect from "@/components/CustomSelect";
import useTranslation from "@/hooks/useTranslation";
import { useLocale } from "@/context/LocaleContext";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Merchant Settings (Language only UI)
 * - Only shows language selector, but POST body also includes name & currency read from /api/me
 *   so we don't accidentally wipe other fields on the server.
 * - CSRF: NextAuth double-submit (fetch /api/auth/csrf → header x-csrf-token).
 * - Security headers: X-Requested-With, Accept-Language.
 * - No native tooltips; just red ring on invalid state.
 */

export default function MerchantSettingsPage() {
  const router = useRouter();
  const t = useTranslation();
  const { locale: ctxLocale, persistLocale } = useLocale();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Back-end’e göndereceğimiz değerleri state’te tutuyoruz;
  // UI’da sadece languagePreference görünüyor.
  const [profile, setProfile] = useState({
    name: "",
    currencyCode: "TRY",
    languagePreference: "en",
  });

  const [originalLang, setOriginalLang] = useState("en");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const msgRef = useRef(null);

  // Basit dil opsiyonları (platformConfig yoksa fallback)
  const languageOptions = useMemo(
    () => [
      { value: "en", label: "English" },
      { value: "tr", label: "Türkçe" },
    ],
    []
  );

  // Yardımcı: CSRF token çek
  async function fetchCsrfToken() {
    try {
      const res = await fetch("/api/auth/csrf", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { "accept": "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      return data?.csrfToken || null;
    } catch {
      return null;
    }
  }

  // İlk yükleme: /api/me ve (gerekirse) /api/currencies
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // Me
        const meRes = await fetch("/api/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "accept": "application/json",
            "cache-control": "no-cache",
          },
        });

        if (meRes.status === 401) { if (!alive) return; router.replace("/merchant/login"); return; }
        if (meRes.status === 403) { if (!alive) return; router.replace("/unauthorized"); return; }

        const me = await meRes.json().catch(() => ({}));

        // /api/me bazı projelerde language/currency döndürmüyor olabilir.
        // Döndürmüyorsa default’ları koru; dönerse al.
        const name = typeof me.name === "string" && me.name.trim() ? me.name.trim() : "Merchant";
        let currency = typeof me.currencyCode === "string" && me.currencyCode ? me.currencyCode : "TRY";
        let lang = typeof me.languagePreference === "string" && me.languagePreference ? me.languagePreference : (ctxLocale || "en");

        // Para birimi sistemde mevcut mu diye bir kez listeyi okumaya çalış (opsiyonel)
        try {
          const curRes = await fetch("/api/currencies", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: { "accept": "application/json" },
          });
          if (curRes.ok) {
            const data = await curRes.json().catch(() => ({}));
            const list = Array.isArray(data?.currencies) ? data.currencies.map(c => c.value || c.code) : [];
            if (list.length && !list.includes(currency)) {
              currency = list[0]; // yoksa platformun ilkini seç
            }
          }
        } catch { /* yoksay */ }

        if (!alive) return;
        setProfile({ name, currencyCode: currency, languagePreference: (lang || "en") });
        setOriginalLang(lang || "en");
        setLoading(false);
      } catch {
        if (!alive) return;
        setError(t("errorGeneric") || "An error occurred.");
        setLoading(false);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mesaj scroll + auto-hide
  useEffect(() => {
    if (!message && !error) return;
    const el = msgRef.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const to = setTimeout(() => { setMessage(""); setError(""); }, 3500);
    return () => clearTimeout(to);
  }, [message, error]);

  // Sadece kırmızı çerçeve – native tooltip yok
  const invalidLang = !["en", "tr"].includes(profile.languagePreference);

  async function handleSave(e) {
    if (e) e.preventDefault();
    setMessage("");
    setError("");

    if (saving) return;
    if (invalidLang) { setError(t("errorGeneric") || "Invalid language."); return; }

    setSaving(true);
    try {
      const csrfToken = await fetchCsrfToken();
      if (!csrfToken) { setError(t("errorGeneric") || "CSRF error."); setSaving(false); return; }

      const res = await fetch("/api/merchant_settings/update", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "x-csrf-token": csrfToken,                      // NextAuth CSRF (double-submit)
          "x-requested-with": "XMLHttpRequest",           // AJAX guard
          "accept-language": (t.locale || "en"),          // backend log/fallback için
        },
        body: JSON.stringify({
          // Sadece dil gösteriyoruz, ama diğer alanları korumak için mevcut değerlerle gönderiyoruz:
          name: profile.name,
          currencyCode: profile.currencyCode,
          languagePreference: profile.languagePreference,
        }),
      });

      if (res.status === 401) { router.replace("/merchant/login"); return; }
      if (res.status === 403) { router.replace("/unauthorized"); return; }

      if (res.status === 429) {
        const retry = Number(res.headers.get("Retry-After") || 15);
        setError((t("tooManyRequests") || "Too many requests") + ` (${retry}s)`);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || t("errorGeneric") || "Error");
        return;
      }

      // Başarılı: locale’i kalıcılaştır
      persistLocale(profile.languagePreference);
      setOriginalLang(profile.languagePreference);
      setMessage(t("profileUpdated") || "Profile updated!");
    } catch {
      setError(t("errorGeneric") || "An error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MerchantLayout>
      <main className="flex flex-col items-center w-full max-w-xl mx-auto flex-1 mt-8 px-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh]">
            <div className="text-lg font-semibold text-[#d1ffd0] mb-1">{t("settings") || "Settings"}</div>
            <div className="text-sm text-gray-400">{t("loading") || "Loading..."}</div>
          </div>
        ) : (
          <>
            <form
              onSubmit={handleSave}
              noValidate
              className="w-full bg-[#191919] rounded-2xl shadow-md border border-[#232323] p-6 flex flex-col gap-4"
            >
              <h2 className="font-extrabold text-[15px] font-mono text-center" style={{ color: "#81d742" }}>
                {t("settings") || "Settings"}
              </h2>

              {/* LANGUAGE (only visible control) */}
              <label className="text-xs font-mono font-semibold text-gray-300">
                {t("language") || "Language"}
              </label>
              <div className={`rounded-md ${invalidLang ? "ring-2 ring-red-500" : ""}`}>
                <CustomSelect
                  options={languageOptions}
                  value={profile.languagePreference}
                  onChange={(v) => setProfile((p) => ({ ...p, languagePreference: v }))}
                />
              </div>

              {/* Info / Errors */}
              {(message || error) && (
                <div
                  ref={msgRef}
                  className={`text-center font-semibold mt-2 ${
                    error ? "text-red-400" : "text-[#81d742]"
                  }`}
                >
                  {error || message}
                </div>
              )}

              <button
                type="submit"
                disabled={saving || invalidLang || profile.languagePreference === originalLang}
                className="w-full py-3 font-bold text-base bg-[#81d742] text-[#181818] rounded-lg shadow hover:bg-[#a9ff72] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (t("processing") || "Processing...") : (t("saveChanges") || "Save Changes")}
              </button>

              {/* Gizli alanlar (UI’da göstermiyoruz ama POST’ta korunuyor) */}
              <input type="hidden" value={profile.name} readOnly />
              <input type="hidden" value={profile.currencyCode} readOnly />
            </form>

            {/* Küçük not */}
            <p className="text-xs text-gray-500 font-mono mt-3 text-center">
              {t("profile") || "Profile"} · {t("settings") || "Settings"} — {t("language") || "Language"}: <b>{profile.languagePreference.toUpperCase()}</b>
            </p>
          </>
        )}
      </main>
    </MerchantLayout>
  );
}
