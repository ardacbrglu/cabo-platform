"use client";

import Layout from "@/components/Layout";
import { Headset, Info, CheckCircle, Phone, Mail, Instagram } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useRef } from "react";
import Captcha from "@/components/Captcha";
import { apiFetch } from "@/lib/apiFetch"; // <-- named import

export default function SupportPage() {
  const { user } = useUser();
  const { t, locale } = useTranslation();

  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaKey, setCaptchaKey] = useState(0); // reset için remount
  const msgRef = useRef(null);

  const mapError = (codeOrMsg) => {
    const s = String(codeOrMsg || "").toLowerCase();
    if (s.includes("captcha")) return t("captchaRequired") || "Please complete the captcha.";
    if (s.includes("too many") || s.includes("rate")) return t("tooManyRequests") || "Too many requests. Please try again.";
    if (s.includes("unauthorized")) return t("mustLogin") || "Please login first.";
    if (s.includes("invalid")) return t("errorInvalid") || "Invalid request.";
    return t("errorGeneric") || "Something went wrong. Please try again.";
  };

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setError("");

    const text = message.trim();
    if (!text) return;
    if (!captchaToken) {
      setError(t("captchaRequired") || "Please complete the captcha.");
      return;
    }
    if (!user?.id) {
      setError(t("mustLogin") || "Please login first.");
      return;
    }

    setSending(true);
    try {
      const res = await apiFetch("/api/support", {
        method: "POST",
        headers: {
          // reCAPTCHA token header (server bunu okuyacak)
          "x-recaptcha-token": captchaToken,
          "accept-language": locale || "en",
        },
        body: { message: text },
      });

      // özel 429/401 branch
      if (res.status === 429 || res.status === 401) {
        const data = await res.json().catch(() => ({}));
        setError(mapError(data?.error || res.statusText));
        resetCaptcha();
        setSending(false);
        msgRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSent(true);
        setMessage("");
        resetCaptcha();
        setTimeout(() => setSent(false), 3500);
      } else {
        setError(mapError(data?.error || data?.message));
        resetCaptcha();
      }
    } catch {
      setError(t("errorGeneric") || "Something went wrong. Please try again.");
      resetCaptcha();
    } finally {
      setSending(false);
      msgRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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

            {/* Flash messages */}
            {sent && (
              <div
                ref={msgRef}
                className="flex items-center gap-2 bg-[#182f18] border border-[#81d74280] text-[#aaff99] rounded-md px-4 py-2 mb-4"
                role="status" aria-live="polite"
              >
                <CheckCircle size={18} className="text-[#81d742]" />
                {t("messageSent")}
              </div>
            )}
            {error && (
              <div
                ref={msgRef}
                className="flex items-center gap-2 bg-red-900/80 border border-red-500 text-red-200 rounded-md px-4 py-2 mb-4"
                role="alert" aria-live="assertive"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSend} autoComplete="off" noValidate>
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
                disabled={sending || !message.trim() || !captchaToken || !user?.id}
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
            {/* ... mevcut FAQ içeriğin ... */}
          </div>
        </div>
      </main>
    </Layout>
  );
}
