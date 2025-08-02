'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordResetPage({ params }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const token = params.token;

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    if (!password || !password2) {
      setMessage('Lütfen tüm alanları doldurun.');
      return;
    }
    if (password.length < 8) {
      setMessage('Şifre en az 8 karakter olmalı.');
      return;
    }
    if (password !== password2) {
      setMessage('Şifreler eşleşmiyor.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/password_reset/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setMessage('Şifreniz başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsunuz...');
        setTimeout(() => router.push('/login'), 2500);
      } else {
        setMessage(data.error || 'Bir hata oluştu.');
      }
    } catch (err) {
      setMessage('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-[#111] px-3 py-8">
      <div className="w-full max-w-sm bg-[#181818] rounded-2xl shadow-lg p-7">
        <h1 className="text-2xl font-bold text-[#81d742] mb-4 text-center">Şifre Sıfırlama</h1>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="text-[#d1ffd0] text-sm font-bold">Yeni Şifre</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="rounded bg-[#232323] px-4 py-2 text-white outline-none border border-[#232323] focus:border-[#81d742] text-base"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <label className="text-[#d1ffd0] text-sm font-bold">Yeni Şifre (Tekrar)</label>
          <input
            type="password"
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            className="rounded bg-[#232323] px-4 py-2 text-white outline-none border border-[#232323] focus:border-[#81d742] text-base"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button
            type="submit"
            disabled={loading || success}
            className={`mt-4 py-2 rounded font-bold text-[#181818] text-base transition ${success
              ? "bg-[#232323] text-green-400 cursor-not-allowed"
              : "bg-[#81d742] hover:bg-[#a9ff72]"}`}
          >
            {loading ? "Kaydediliyor..." : "Şifreyi Sıfırla"}
          </button>
        </form>
        {message && (
          <div className={`mt-4 text-center text-sm font-bold ${success ? "text-green-400" : "text-red-400"}`}>
            {message}
          </div>
        )}
      </div>
      <style jsx>{`
        input::-webkit-input-placeholder { color: #aaa; }
        input:-ms-input-placeholder { color: #aaa; }
        input::placeholder { color: #aaa; }
      `}</style>
    </main>
  );
}
