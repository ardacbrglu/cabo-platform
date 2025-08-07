// SORUMLULUK: Şifre sıfırlama ana sayfa entry. Content dosyasını lazy yükler.
'use client';
import { Suspense } from "react";
import PasswordResetContent from "./Content";

export default function PasswordResetPage() {
  return (
    <Suspense fallback={null}>
      <PasswordResetContent />
    </Suspense>
  );
}
