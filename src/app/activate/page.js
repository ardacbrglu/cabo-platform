'use client';

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ActivatePage() {
  const [status, setStatus] = useState('loading');
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setTimeout(() => router.replace('/activated?error=1'), 2000);
      return;
    }
    // API'ye GET isteği atılır, backend aktive eder ve /activated sayfasına yönlendirir
    fetch(`/api/activate?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (res.redirected) {
          // API backend yönlendirme yaptıysa, frontend de takip etsin:
          router.replace(res.url.replace(/^.*\/\/[^\/]+/, '')); // sadece path/query
        } else if (res.ok) {
          setStatus('success');
          setTimeout(() => router.replace('/activated'), 2000);
        } else {
          setStatus('error');
          setTimeout(() => router.replace('/activated?error=1'), 2000);
        }
      })
      .catch(() => {
        setStatus('error');
        setTimeout(() => router.replace('/activated?error=1'), 2000);
      });
  }, [token, router]);

  if (status === 'loading') return <div className="text-white text-center py-12">Hesabınız doğrulanıyor...</div>;
  if (status === 'success') return <div className="text-green-400 text-center py-12">Aktivasyon başarılı, giriş sayfasına yönlendiriliyorsunuz...</div>;
  return <div className="text-red-400 text-center py-12">Aktivasyon hatası. Lütfen tekrar deneyin.</div>;
}
