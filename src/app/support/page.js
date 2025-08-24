// /app/support/page.jsx
"use client";

import Layout from "@/components/Layout";
import { Headset, Info, CheckCircle, Phone, Mail, Instagram } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useRef } from "react";
import Captcha from "@/components/Captcha";
import apiFetch from "@/lib/apiFetch";

export default function SupportPage() {
  const { user } = useUser();
  const { t } = useTranslation();

  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaKey, setCaptchaKey] = useState(0); // reset için remount
  const msgRef = useRef(null);

  const handleSend = async (e) => {
    e.preventDefault();
    setError("");

    if (!message.trim()) return;
    if (!captchaToken) {
      setError(t("captchaRequired") || "Please complete the captcha.");
      return;
    }

    setSending(true);
    try {
      const res = await apiFetch("/api/support", {
        method: "POST",
        headers: {
          // CSRF header'ını apiFetch otomatik ekler; reCAPTCHA token'ını biz ekliyoruz
          "x-recaptcha-token": captchaToken,
        },
        body: { message },
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSent(true);
        setMessage("");
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1); // captcha reset
        setTimeout(() => setSent(false), 3500);
      } else {
        setError(data.error || t("errorGeneric"));
        setCaptchaToken(null);
        setCaptchaKey((k) => k + 1);
      }
    } catch {
      setError(t("errorGeneric"));
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setSending(false);
      if (msgRef.current) {
        msgRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  return (
    <Layout>
      <main className="w-full flex flex-col items-center min-h-[80vh] px-2 py-8">
        <div className="flex flex-col lg:flex-row items-start justify-center gap-6 w-full max-w-6xl mx-auto">
          {/* Contact Support */}
          <div className="bg-[#181818] rounded-2xl shadow py-8 px-7 border border-[#222328]/70 flex-1 max-w-md min-w-[310px] mx-auto">
            <div className="flex items-center gap-2 mb-3 text-[#81d742] font-extrabold text-lg">
              <Headset size={21} /> {t("contactSupport")}
            </div>
            <div className="text-gray-300 font-mono text-xs mb-2">
              {user?.name ? (
                <>
                  {t("loggedInAs")}{" "}
                  <span className="font-bold text-[#d1ffd0]">{user.name}</span>
                  <span className="text-gray-500"> ({user.email})</span>
                </>
              ) : (
                t("notLoggedIn")
              )}
            </div>

            {/* Başarı / Hata Mesajları */}
            {sent && (
              <div
                ref={msgRef}
                className="flex items-center gap-2 bg-[#182f18] border border-[#81d74280] text-[#aaff99] rounded-md px-4 py-2 mb-4"
              >
                <CheckCircle size={18} className="text-[#81d742]" />
                {t("messageSent")}
              </div>
            )}
            {error && (
              <div
                ref={msgRef}
                className="flex items-center gap-2 bg-red-900/80 border border-red-500 text-red-200 rounded-md px-4 py-2 mb-4"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSend} autoComplete="off">
              <label className="block text-[#d1ffd0] text-xs font-bold font-mono mb-2">
                {t("yourMessage")}
              </label>
              <textarea
                className="bg-[#161616] border border-[#222] rounded px-4 py-2 mb-3 text-white w-full outline-none text-sm font-mono resize-none min-h-[80px] transition"
                placeholder={t("supportPlaceholder")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
                required
                maxLength={900}
                autoComplete="off"
              />

              {/* CAPTCHA */}
              <Captcha
                key={captchaKey}
                onChange={setCaptchaToken}
                lang={(user?.languagePreference || "en").toLowerCase()}
                className="mb-3"
              />

              <button
                type="submit"
                className="w-full py-2 rounded font-bold font-mono bg-[#81d742] hover:bg-[#a9ff72] text-[#181818] text-base transition disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={sending || !message.trim() || !captchaToken}
              >
                {sending ? t("sending") : t("send")}
              </button>
            </form>
          </div>

          {/* Contact Info Card */}
          <div className="bg-[#181818] rounded-2xl shadow py-8 px-7 border border-[#222328]/70 flex-1 max-w-md min-w-[310px] mx-auto mt-8 lg:mt-0">
            <div className="flex items-center gap-2 mb-4 text-[#81d742] font-extrabold text-lg">
              <Mail size={21} /> {t("contactInfo")}
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-[#d1ffd0]">
                <Mail size={17} className="text-[#81d742]" />
                <span className="font-mono text-xs">caboaffiliates@gmail.com</span>
              </div>
              <div className="flex items-center gap-2 text-[#d1ffd0]">
                <Phone size={17} className="text-[#81d742]" />
                <span className="font-mono text-xs">{t("supportLine")}: +90 --- --- -- --</span>
              </div>
              <div className="flex items-center gap-2 text-[#d1ffd0]">
                <Instagram size={17} className="text-[#81d742]" />
                <span className="font-mono text-xs">@caboaff</span>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-[#181818] rounded-2xl shadow py-8 px-7 border border-[#222328]/70 flex-1 max-w-md min-w-[310px] mx-auto mt-8 lg:mt-0">
            <div className="flex items-center gap-2 mb-4 text-[#81d742] font-extrabold text-lg">
              <Info size={21} /> {t("faq")}
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-mono text-[#d1ffd0] mb-1 font-bold">{t("faqWithdraw")}</div>
                <div className="text-gray-300 text-xs font-mono">{t("faqWithdrawAnswerLong")}</div>
              </div>
              <div>
                <div className="text-xs font-mono text-[#d1ffd0] mb-1 font-bold">{t("faqAffiliateLinks")}</div>
                <div className="text-gray-300 text-xs font-mono">{t("faqAffiliateLinksAnswerLong")}</div>
              </div>
              <div>
                <div className="text-xs font-mono text-[#d1ffd0] mb-1 font-bold">{t("faqWhenPayout")}</div>
                <div className="text-gray-300 text-xs font-mono">{t("faqWhenPayoutAnswerLong")}</div>
              </div>
              <div>
                <div className="text-xs font-mono text-[#d1ffd0] mb-1 font-bold">{t("faqPayoutMethod")}</div>
                <div className="text-gray-300 text-xs font-mono">{t("faqPayoutMethodAnswerLong")}</div>
              </div>
              <div>
                <div className="text-xs font-mono text-[#d1ffd0] mb-1 font-bold">{t("faqContactChange")}</div>
                <div className="text-gray-300 text-xs font-mono">{t("faqContactChangeAnswerLong")}</div>
              </div>
              <div>
                <div className="text-xs font-mono text-[#d1ffd0] mb-1 font-bold">{t("faqNoCommission")}</div>
                <div className="text-gray-300 text-xs font-mono">{t("faqNoCommissionAnswerLong")}</div>
              </div>
            </div>
            <div className="mt-7 text-gray-400 font-mono text-[0.90rem] text-center">
              {t("stillNeedHelp")}{" "}
              <span className="text-[#81d742] underline">{t("sendSupportMessageSuggestion")}</span>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
