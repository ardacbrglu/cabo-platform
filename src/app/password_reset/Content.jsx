'use client';
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import useCsrfToken from "@/hooks/useCsrfToken"; // ⬅️ default import

const t = {
  en: {
    forgot: "Forgot your password?",
    enterEmail: "Enter your email",
    send: "Send Reset Email",
    sending: "Sending...",
    emailSent: "If user exists, password reset email sent.",
    setNew: "Set a new password",
    newPw: "New password",
    repeatPw: "Repeat new password",
    save: "Set Password",
    saving: "Saving...",
    required: "Please fill all fields.",
    mismatch: "Passwords do not match.",
    weak: "Password must be at least 8 chars, with letters and numbers.",
    invalid: "Token invalid or expired.",
    server: "Server error. Please try again.",
    success: "Password successfully changed. Redirecting...",
  },
  tr: {
    forgot: "Şifreni mi unuttun?",
    enterEmail: "E-postanı gir",
    send: "Sıfırlama maili gönder",
    sending: "Gönderiliyor...",
    emailSent: "Kullanıcı varsa şifre sıfırlama e-postası gönderildi.",
    setNew: "Yeni şifre belirle",
    newPw: "Yeni şifre",
    repeatPw: "Yeni şifre (tekrar)",
    save: "Şifreyi Kaydet",
    saving: "Kaydediliyor...",
    required: "Lütfen tüm alanları doldurun.",
    mismatch: "Şifreler uyuşmuyor.",
    weak: "Şifre en az 8 karakter ve harf/rakam içermeli.",
    invalid: "Token geçersiz veya süresi dolmuş.",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    success: "Şifre başarıyla değiştirildi. Yönlendiriliyorsunuz...",
  }
};

export default function PasswordResetContent() {
  const [step, setStep] = useState("request"); // "request" | "confirm"
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const csrfToken = useCsrfToken();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const langParam = params.get("lang");
  const locale = (langParam && ["en", "tr"].includes(langParam))
    ? langParam
    : (typeof window !== "undefined" && (navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en");
  const trans = t[locale];

  useEffect(() => {
    if (token) setStep("confirm");
  }, [token]);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const res = await fetch("/api/password_reset/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",
          "accept-language": locale,
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setSuccess(trans.emailSent);
      else setError(data.message || trans.server);
    } catch {
      setError(trans.server);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");

    if (!pw || !pw2) return setError(trans.required);
    if (pw !== pw2) return setError(trans.mismatch);
    if (pw.length < 8 || !/\d/.test(pw) || !/[a-zA-Z]/.test(pw)) return setError(trans.weak);

    setLoading(true);
    try {
      const res = await fetch("/api/password_reset/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",
          "accept-language": locale,
        },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSuccess(trans.success);
        setTimeout(() => router.replace("/login"), 2000);
      } else {
        setError(data.message || trans.server);
      }
    } catch {
      setError(trans.server);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md bg-[#161a16] border border-[#252925] rounded-2xl shadow-xl p-10">
          {step === "request" ? (
            <>
              <h2 className="text-2xl font-bold mb-4 text-[#d1ffd0]">{trans.forgot}</h2>
              <form onSubmit={handleRequest} className="flex flex-col gap-4">
                <input
                  type="email"
                  placeholder={trans.enterEmail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                />
                {error && <div className="text-red-500 text-center">{error}</div>}
                {success && <div className="text-green-400 text-center">{success}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-lg font-semibold bg-[#81d742] text-[#111] rounded-lg hover:bg-[#b3ffb3] transition"
                >
                  {loading ? trans.sending : trans.send}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-4 text-[#d1ffd0]">{trans.setNew}</h2>
              <form onSubmit={handleConfirm} className="flex flex-col gap-4">
                <input
                  type="password"
                  placeholder={trans.newPw}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                />
                <input
                  type="password"
                  placeholder={trans.repeatPw}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                />
                {error && <div className="text-red-500 text-center">{error}</div>}
                {success && <div className="text-green-400 text-center">{success}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-lg font-semibold bg-[#81d742] text-[#111] rounded-lg hover:bg-[#b3ffb3] transition"
                >
                  {loading ? trans.saving : trans.save}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
