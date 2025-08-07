'use client';
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ActivatedPage() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");

  useEffect(() => {
    const timer = setTimeout(() => router.replace("/login"), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      {error ?
        <div className="text-red-400 text-lg">Aktivasyon başarısız veya link geçersiz.</div>
        :
        <div className="text-green-400 text-lg">Aktivasyon başarılı! Şimdi giriş yapabilirsiniz.</div>
      }
      <div className="mt-4 text-gray-400 text-sm">Giriş sayfasına yönlendiriliyorsunuz...</div>
    </div>
  );
}
