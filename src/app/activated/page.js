'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ActivatedPage() {
  const params = useSearchParams();
  const router = useRouter();
  const isError = params.get("error");

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.push("/login");
    }, 3000);
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <div className="flex flex-col justify-center items-center min-h-screen text-white text-center px-6">
      {isError ? (
        <>
          <h1 className="text-3xl font-bold mb-4">Activation Failed</h1>
          <p className="text-red-400 text-lg">Your activation link is invalid or expired.</p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold mb-4">Account Activated!</h1>
          <p className="text-green-400 text-lg">Your account is now active. Redirecting to login...</p>
        </>
      )}
    </div>
  );
}
