'use client';
import { useSearchParams } from 'next/navigation';

export default function ActivatedPage() {
  const params = useSearchParams();
  const isError = params.get("error");

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
          <p className="text-green-400 text-lg">Your account is now active. You can log in.</p>
        </>
      )}
    </div>
  );
}
