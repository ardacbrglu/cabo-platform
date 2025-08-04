// ✅ FRONTEND: app/activate/page.js
"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ActivatePage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [message, setMessage] = useState("Hesabınız aktifleştiriliyor...");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) return setMessage("Aktivasyon bağlantısı geçersiz.");

    fetch(`/api/activate?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMessage("✅ Hesabınız başarıyla aktifleştirildi. Artık giriş yapabilirsiniz.");
          setSuccess(true);
        } else {
          setMessage("❌ Aktivasyon başarısız: " + data.message);
        }
      })
      .catch(() => setMessage("❌ Bir hata oluştu. Lütfen tekrar deneyin."));
  }, [token]);

  return (
    <div className="max-w-md mx-auto mt-20 text-center text-white">
      <h2 className="text-2xl font-bold mb-4">Hesap Aktivasyonu</h2>
      <p className="mb-6">{message}</p>
      {success && (
        <Link href="/login" className="text-blue-500 underline">
          Giriş Sayfasına Git
        </Link>
      )}
    </div>
  );
}