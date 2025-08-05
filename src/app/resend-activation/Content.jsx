"use client";

import React, { useState } from "react";

export default function ResendActivationContent() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setError("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/resend-activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept-language": navigator.language || "en",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        setEmail("");
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("İşlem sırasında bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-16 bg-zinc-900 text-white p-6 rounded-xl shadow-lg">
      <h1 className="text-2xl font-bold mb-4">Aktivasyon E-postası Yeniden Gönder</h1>
      <p className="text-sm text-zinc-400 mb-4">
        Kayıt sırasında gelen aktivasyon bağlantısını almadıysanız, buradan yeni bir bağlantı isteyebilirsiniz.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="E-posta adresiniz"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 rounded bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded transition"
        >
          {loading ? "Gönderiliyor..." : "Yeniden Gönder"}
        </button>
      </form>

      {message && <p className="text-green-400 mt-4 text-sm">{message}</p>}
      {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
    </div>
  );
}
