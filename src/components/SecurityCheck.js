'use client';
import React from "react";
import { CheckCircle, XCircle } from "lucide-react";

// Basit örnek: şifre güvenliği, 2FA, email doğrulama
export default function SecurityCheck({ user, i18n = {} }) {
  const items = [
    { label: i18n.emailVerified || "E-posta doğrulandı", ok: user?.email_verified },
    { label: i18n.strongPassword || "Güçlü şifre", ok: user?.password_strong },
    { label: i18n.twoFactor || "2 Adımlı Doğrulama", ok: user?.two_factor_enabled }
  ];

  return (
    <div className="bg-[#202] rounded-xl p-4 flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          {item.ok ? <CheckCircle className="text-green-400" /> : <XCircle className="text-red-400" />}
          <span className={item.ok ? "text-green-300" : "text-red-300"}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
