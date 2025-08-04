"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PublicLayout from "@/components/PublicLayout";

export default function PasswordResetPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  // Eğer token varsa: yeni şifre formu, yoksa e-posta formu göster
  if (token) return <PasswordSetForm token={token} />;
  return <PasswordRequestForm />;
}

// E-posta girip mail göndertme
function PasswordRequestForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/password_reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSent(true);
      } else {
        setError(data.message || "Something went wrong.");
      }
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto mt-20 bg-[#181818] rounded-2xl p-8 border border-[#232323] shadow">
        <h2 className="text-3xl font-bold text-[#d1ffd0] mb-6">Şifre Sıfırlama</h2>
        {sent ? (
          <div className="text-green-400 text-lg font-semibold">
            Eğer hesabınız varsa, şifre sıfırlama bağlantısı e-postanıza gönderildi.
            <br /><br />
            <Link href="/login" className="text-[#81d742] underline">Girişe dön</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <input
              type="email"
              placeholder="E-posta adresiniz"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-[#232323] text-white rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              required
              autoComplete="email"
            />
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition"
            >
              {loading ? "Gönderiliyor..." : "Şifre sıfırlama linki gönder"}
            </button>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}

// Şifre yenileme formu
function PasswordSetForm({ token }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalı.");
      return;
    }
    if (password !== password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/password_reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.message || "Bir hata oluştu.");
      }
    } catch {
      setError("Sunucu hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto mt-20 bg-[#181818] rounded-2xl p-8 border border-[#232323] shadow">
        <h2 className="text-3xl font-bold text-[#d1ffd0] mb-6">Yeni Şifre Belirle</h2>
        {success ? (
          <div className="text-green-400 text-lg font-semibold">
            Şifreniz başarıyla değiştirildi.<br /><br />
            <Link href="/login" className="text-[#81d742] underline">Giriş yap</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <input
              type="password"
              placeholder="Yeni şifre"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-[#232323] text-white rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              required
              autoComplete="new-password"
              minLength={8}
            />
            <input
              type="password"
              placeholder="Yeni şifre (tekrar)"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              className="bg-[#232323] text-white rounded-lg px-4 py-3 border border-[#222] focus:outline-none focus:ring-2 focus:ring-[#81d742]"
              required
              minLength={8}
            />
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="bg-[#81d742] hover:bg-[#b3ffb3] text-[#0b0b0b] font-bold py-3 rounded-lg transition"
            >
              {loading ? "Kaydediliyor..." : "Şifreyi Değiştir"}
            </button>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}
