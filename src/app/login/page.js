'use client';
import { Suspense } from "react";
import LoginContent from "./LoginContent";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-white text-center py-12">Yükleniyor...</div>}>
      <LoginContent />
    </Suspense>
  );
}
