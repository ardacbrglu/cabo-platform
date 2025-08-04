// ✅ FRONTEND: app/activate/content.jsx
"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";

export default function ActivateContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const locale = useLocale();

  const [message, setMessage] = useState(locale === "tr" ? "Hesabınız aktifleştiriliyor..." : "Your account is being activated...");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setMessage(locale === "tr" ? "Aktivasyon bağlantısı geçersiz." : "Activation link is invalid.");
      return;
    }

    fetch(`/api/activate?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMessage(locale === "tr"
            ? "✅ Hesabınız başarıyla aktifleştirildi. Artık giriş yapabilirsiniz."
            : "✅ Your account has been successfully activated. You can now log in.");
          setSuccess(true);
        } else {
          setMessage((locale === "tr" ? "❌ Aktivasyon başarısız: " : "❌ Activation failed: ") + data.message);
        }
      })
      .catch(() => {
        setMessage(locale === "tr" ? "❌ Bir hata oluştu. Lütfen tekrar deneyin." : "❌ An error occurred. Please try again.");
      });
  }, [token, locale]);

  return (
    <div className="max-w-md mx-auto mt-20 text-center text-white px-4">
      <h2 className="text-2xl font-bold mb-4">
        {locale === "tr" ? "Hesap Aktivasyonu" : "Account Activation"}
      </h2>
      <p className="mb-6 text-base leading-relaxed text-gray-200">{message}</p>
      {success && (
        <Link href="/login" className="text-[#81d742] underline text-lg">
          {locale === "tr" ? "Giriş Sayfasına Git" : "Go to Login Page"}
        </Link>
      )}
    </div>
  );
}
