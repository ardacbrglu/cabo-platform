'use client';
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import PublicLayout from "@/components/PublicLayout";

const t = {
  en: {
    title: "Set Your Password",
    desc: "You're almost done! Please set a password to activate your account.",
    name: "Name",
    email: "Email",
    password: "Password",
    confirm: "Confirm Password",
    create: "Create Password",
    creating: "Creating...",
    mismatch: "Passwords do not match.",
    short: "Password must be at least 8 characters, with letters and numbers.",
    required: "Please fill all fields.",
    success: "Password set! Redirecting...",
    server: "Server error. Please try again.",
    forbidden: "This page is only for users who registered with Google and haven't set a password.",
  },
  tr: {
    title: "Şifreni Belirle",
    desc: "Neredeyse hazırsın! Hesabını aktifleştirmek için bir şifre oluştur.",
    name: "Adınız",
    email: "E-posta",
    password: "Şifre",
    confirm: "Şifreyi Tekrarla",
    create: "Şifreyi Oluştur",
    creating: "Oluşturuluyor...",
    mismatch: "Şifreler uyuşmuyor.",
    short: "Şifre en az 8 karakter olmalı, harf ve rakam içermeli.",
    required: "Lütfen tüm alanları doldurun.",
    success: "Şifre oluşturuldu! Yönlendiriliyorsunuz...",
    server: "Sunucu hatası. Lütfen tekrar deneyin.",
    forbidden: "Bu sayfa sadece Google ile kaydolup henüz şifre oluşturmayanlar içindir.",
  }
};

export default function CreatePasswordPage() {
  const [user, setUser] = useState(null);
  const [locale, setLocale] = useState("en");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const csrfToken = useCsrfToken();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me")
      .then(res => res.json())
      .then(data => {
        // Sadece passwordHash olmayan kullanıcılar erişebilir!
        if (!data || !data.email || data.passwordHash) {
          setError(t[locale].forbidden);
          setTimeout(() => router.replace("/login"), 2000);
        } else {
          setUser(data);
          setLocale((data.languagePreference || "en").toLowerCase().startsWith("tr") ? "tr" : "en");
        }
      })
      .catch(() => {
        setError(t[locale].server);
        setTimeout(() => router.replace("/login"), 2000);
      });
    // eslint-disable-next-line
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!pw || !pw2) {
      setError(t[locale].required);
      return;
    }
    if (pw.length < 8 || !/\d/.test(pw) || !/[a-zA-Z]/.test(pw)) {
      setError(t[locale].short);
      return;
    }
    if (pw !== pw2) {
      setError(t[locale].mismatch);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/create_password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",
          "accept-language": locale,
        },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(t[locale].success);
        setTimeout(() => router.replace("/dashboard"), 1200); // Direkt dashboard
      } else {
        setError(data.message || t[locale].server);
      }
    } catch {
      setError(t[locale].server);
    } finally {
      setLoading(false);
    }
  };

  if (error && !user) {
    return (
      <PublicLayout>
        <div className="py-24 text-center text-red-400 text-xl">{error}</div>
      </PublicLayout>
    );
  }

  if (!user) {
    return (
      <PublicLayout>
        <div className="py-24 text-center text-gray-300 text-xl">Loading...</div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md bg-[#161a16] border border-[#252925] rounded-2xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-[#d1ffd0] mb-2 text-center">{t[locale].title}</h2>
          <p className="text-gray-400 text-center mb-7">{t[locale].desc}</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-gray-400 mb-1">{t[locale].name}</label>
              <div className="w-full py-2 px-3 bg-[#232823] rounded-lg text-[#e4ffe4] font-bold">{user.name}</div>
            </div>
            <div>
              <label className="block text-gray-400 mb-1">{t[locale].email}</label>
              <div className="w-full py-2 px-3 bg-[#232823] rounded-lg text-[#e4ffe4] font-mono">{user.email}</div>
            </div>
            <div>
              <label className="block text-gray-400 mb-1">{t[locale].password}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">{t[locale].confirm}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              />
            </div>
            {error && <div className="text-red-500 text-center">{error}</div>}
            {success && <div className="text-green-400 text-center">{success}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-lg font-semibold bg-[#81d742] text-[#111] rounded-lg hover:bg-[#b3ffb3] transition"
            >
              {loading ? t[locale].creating : t[locale].create}
            </button>
          </form>
        </div>
      </div>
    </PublicLayout>
  );
}
