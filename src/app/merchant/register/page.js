'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import PublicLayout from '@/components/PublicLayout';
import { useLocale } from "@/context/LocaleContext";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import dynamic from "next/dynamic";

const Captcha = dynamic(() => import("@/components/Captcha"), { ssr: false });

const translations = {
  en: {
    title: "Register Your Business",
    infoTitle: "Grow your business with Cabo",
    infoDesc: "Register your business, create your merchant account and start tracking your affiliate-driven product sales.",
    infoStrong: "Cabo gives you a complete affiliate infrastructure — so you can focus on growth.",
    li1: "Live tracking and conversion validation",
    li2: "Control commissions per product",
    li3: "Webhook integration and analytics dashboard",
    li4: "Secure payment reporting & sales stats",
    loginQ: "Already have a merchant account?",
    loginBtn: "Login here",
    company: "Company Name",
    fullName: "Full Name (Authorized Person)",
    email: "Business Email",
    phone: "Phone Number",
    password: "Password",
    submit: "Create Account",
    loading: "Creating...",
    required: "Please fill in all fields.",
    success: "Your merchant account request has been received and is now pending approval. You will be notified by email once your account is activated.",
    failed: "Registration failed.",
    invalidCompany: "Company name must be 2–150 valid characters.",
    invalidName: "Full name must be 3–40 characters (letters/numbers/space/_).",
    invalidPhone: "Invalid phone number.",
    invalidEmail: "Invalid email address.",
    invalidPassword: "Password must be at least 8 characters and include both letters and numbers.",
    acceptTerms: <>
      I accept the <Link href="/merchant/terms" className="text-[#81d742] underline hover:text-[#b3ffb3]" target="_blank">Terms</Link> and <Link href="/merchant/privacy" className="text-[#81d742] underline hover:text-[#b3ffb3]" target="_blank">Privacy Policy</Link>
    </>,
    mustAccept: "You must accept the Terms and Privacy Policy.",
    howWorksQ: "How does our system work?",
    howWorksLink: "See Details",
    csrfWait: "Preparing a secure session… Please try again.",
  },
  tr: {
    title: "İşletmeni Kaydet",
    infoTitle: "İşletmeni Cabo ile büyüt",
    infoDesc: "İşletmeni kaydet, satıcı hesabını oluştur ve affiliate yönlendirmeleriyle gelen satışlarını anlık takip et.",
    infoStrong: "Cabo, eksiksiz affiliate altyapısı sunar — sen sadece büyümeye odaklan.",
    li1: "Anlık takip & dönüşüm doğrulama",
    li2: "Her ürün için komisyon kontrolü",
    li3: "Webhook entegrasyonu & analiz paneli",
    li4: "Güvenli ödeme ve satış raporları",
    loginQ: "Zaten satıcı hesabın var mı?",
    loginBtn: "Giriş yap",
    company: "Şirket Adı",
    fullName: "Ad Soyad (Yetkili)",
    email: "Firma E-posta",
    phone: "Telefon Numarası",
    password: "Şifre",
    submit: "Hesabı Oluştur",
    loading: "Kaydediliyor...",
    required: "Lütfen tüm alanları doldurun.",
    success: "Satıcı başvurun alındı ve onay bekliyor. Hesabın aktif olduğunda e-posta ile bilgilendirileceksin.",
    failed: "Kayıt başarısız.",
    invalidCompany: "Şirket adı 2–150 geçerli karakter olmalı.",
    invalidName: "Ad Soyad 3–40 karakter olmalı (harf/rakam/boşluk/_).",
    invalidPhone: "Geçersiz telefon numarası.",
    invalidEmail: "Geçersiz e-posta.",
    invalidPassword: "Şifre en az 8 karakter olmalı; harf ve rakam içermeli.",
    acceptTerms: <>
      <Link href="/merchant/terms" className="text-[#81d742] underline hover:text-[#b3ffb3]" target="_blank">Kullanım</Link>
      {" ve "}
      <Link href="/merchant/privacy" className="text-[#81d742] underline hover:text-[#b3ffb3]" target="_blank">Gizlilik Şartlarını</Link>
      {" kabul ediyorum"}
    </>,
    mustAccept: "Kullanım ve Gizlilik Şartlarını kabul etmelisin.",
    howWorksQ: "Sistemimiz nasıl çalışır?",
    howWorksLink: "Detaylı Bilgi",
    csrfWait: "Güvenli oturum hazırlanıyor… Lütfen tekrar deneyin.",
  }
};

export default function MerchantRegisterPage() {
  const { locale, ready } = useLocale();
  const { csrfToken, ready: csrfReady } = useCsrfToken();

  const [form, setForm] = useState({
    companyName: "",
    name: "",
    email: "",
    password: "",
    phone: "",
    countryCode: "+90",
  });
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // NextAuth CSRF çerezlerini önden bırak (edge-case azaltır)
  useEffect(() => {
    fetch("/api/auth/csrf", { credentials: "include" }).catch(() => {});
  }, []);

  if (!ready) return null;
  const t = (key) => translations[locale][key] || key;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // backend Zod ile hizalı basic regexler
  const reName = /^[\p{L}\p{N}_ ]+$/u;
  const reCompany = /^[\p{L}\p{N}\s&_.,'’()\-]+$/u;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    if (!csrfReady || !csrfToken) { setError(t("csrfWait")); setLoading(false); return; }
    if (!terms) { setError(t("mustAccept")); setLoading(false); return; }
    if (!form.companyName || !form.name || !form.email || !form.password || !form.phone) { setError(t("required")); setLoading(false); return; }
    if (form.companyName.length < 2 || form.companyName.length > 150 || !reCompany.test(form.companyName.trim())) { setError(t("invalidCompany")); setLoading(false); return; }
    if (form.name.length < 3 || form.name.length > 40 || !reName.test(form.name.trim())) { setError(t("invalidName")); setLoading(false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError(t("invalidEmail")); setLoading(false); return; }
    if (form.password.length < 8 || !/\d/.test(form.password) || !/[a-zA-Z]/.test(form.password)) { setError(t("invalidPassword")); setLoading(false); return; }
    if (!/^\d{10,15}$/.test(form.phone)) { setError(t("invalidPhone")); setLoading(false); return; }
    if (!captcha) { setError(locale === "tr" ? "Lütfen robot olmadığınızı doğrulayın." : "Please complete the captcha."); setLoading(false); return; }

    const fullPhone = `${form.countryCode}${form.phone}`.trim();

    // 🔒 benzersiz request-id
    const requestId =
      (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const res = await fetch("/api/register_merchant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken || "",
        "accept-language": locale || "en",
        "x-requested-with": "XMLHttpRequest",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        companyName: form.companyName,
        name: form.name,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phoneNumber: fullPhone,
        termsAccepted: terms,
        captcha,
      }),
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      setError(data?.message || t("failed"));
    } else {
      setSuccess(true);
      setTimeout(() => { window.location.href = "/merchant"; }, 2500);
    }
    setLoading(false);
  };

  return (
    <PublicLayout>
      <div className="flex flex-col md:flex-row w-full items-center justify-center gap-12 py-10 px-4 sm:px-6 max-w-5xl mx-auto min-h-[65vh]">
        {/* LEFT INFO */}
        <div className="max-w-lg w-full mb-8 md:mb-0 flex flex-col items-center text-center mx-auto cabo-mobile-top-space cabo-mobile-bottom-space">
          <div className="mb-6">
            <h2 className="text-4xl md:text-5xl font-bold text-[#d1ffd0] mb-4">{t("infoTitle")}</h2>
            <p className="text-gray-300 text-lg mb-4">{t("infoDesc")}</p>
            <p className="text-[#81d742] font-semibold text-lg mb-6">{t("infoStrong")}</p>
            <ul className="text-gray-400 text-base mb-6 list-disc pl-6 text-left space-y-2 mx-auto" style={{ maxWidth: 340 }}>
              <li>{t("li1")}</li>
              <li>{t("li2")}</li>
              <li>{t("li3")}</li>
              <li>{t("li4")}</li>
            </ul>
            <div className="text-gray-400 text-sm mb-2">
              {t("loginQ")}{" "}
              <Link href="/merchant" className="text-[#81d742] underline hover:text-[#b3ffb3]">
                {t("loginBtn")}
              </Link>
            </div>
            <div className="text-[#81d742] mt-4 text-base font-semibold">
              {t("howWorksQ")}{" "}
              <Link href="/merchant/info" className="underline hover:text-[#b3ffb3] transition">
                {t("howWorksLink")}
              </Link>
            </div>
          </div>
        </div>

        {/* REGISTER FORM */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg px-8 py-10 w-full max-w-md flex flex-col items-center border border-[#232323] cabo-mobile-bottom-space">
          <h3 className="text-3xl font-bold text-[#d1ffd0] mb-4">{t("title")}</h3>

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-6" autoComplete="off">
            <input
              type="text"
              name="companyName"
              placeholder={t("company")}
              value={form.companyName}
              onChange={handleChange}
              spellCheck={false}
              inputMode="text"
              autoCorrect="off"
              required
              className="bg-white text-black rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
            <input
              type="text"
              name="name"
              placeholder={t("fullName")}
              value={form.name}
              onChange={handleChange}
              spellCheck={false}
              inputMode="text"
              autoCorrect="off"
              required
              className="bg-white text-black rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
            <input
              type="email"
              name="email"
              placeholder={t("email")}
              value={form.email}
              onChange={handleChange}
              inputMode="email"
              spellCheck={false}
              autoCorrect="off"
              required
              className="bg-white text-black rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />
            <div className="flex gap-3">
              <select
                name="countryCode"
                value={form.countryCode}
                onChange={handleChange}
                className="bg-white text-black rounded-lg px-3 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              >
                <option value="+90">🇹🇷 +90</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+49">🇩🇪 +49</option>
                <option value="+33">🇫🇷 +33</option>
              </select>
              <input
                type="tel"
                name="phone"
                placeholder={t("phone")}
                value={form.phone}
                onChange={handleChange}
                inputMode="numeric"
                autoCorrect="off"
                spellCheck="false"
                required
                className="bg-white text-black flex-1 rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              />
            </div>
            <input
              type="password"
              name="password"
              placeholder={t("password")}
              value={form.password}
              onChange={handleChange}
              minLength={8}
              autoComplete="new-password"
              required
              className="bg-white text-black rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
            />

            <div className="flex items-center gap-2 mb-3 w-full">
              <input
                type="checkbox"
                id="terms"
                checked={terms}
                onChange={e => setTerms(e.target.checked)}
                required
                className="accent-[#81d742] h-4 w-4"
              />
              <label htmlFor="terms" className="text-sm text-gray-400 select-none cursor-pointer flex gap-1 flex-wrap">
                {t("acceptTerms")}
              </label>
            </div>

            {/* CAPTCHA */}
            <Captcha onChange={setCaptcha} lang={locale} />

            {error && <p className="text-red-500 text-base">{error}</p>}
            {success && <p className="text-green-400 text-base">{t("success")}</p>}

            <button
              type="submit"
              disabled={loading || !csrfReady}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition"
            >
              {loading ? <Loader2 className="animate-spin mx-auto" size={18} /> : t("submit")}
            </button>
          </form>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          .cabo-mobile-top-space { margin-top: 1rem; }
          .cabo-mobile-bottom-space { margin-bottom: 3rem; }
        }
      `}</style>
    </PublicLayout>
  );
}
