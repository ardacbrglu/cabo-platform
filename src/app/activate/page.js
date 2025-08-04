'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function ActivatePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState('Activating...');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setMessage("Missing activation token.");
      return;
    }

    fetch(`/api/activate?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSuccess(true);
          setMessage("Account activated! You can now log in.");
        } else {
          setSuccess(false);
          setMessage(data.message || "Activation failed.");
        }
      })
      .catch(() => {
        setMessage("An error occurred.");
        setSuccess(false);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 text-center">
      <h2 className={`text-3xl font-bold mb-4 ${success ? 'text-green-400' : 'text-red-400'}`}>
        {message}
      </h2>
      {success && (
        <button
          onClick={() => router.push('/login')}
          className="mt-4 px-6 py-3 rounded-lg bg-[#81d742] text-black hover:bg-[#aaff6c] transition"
        >
          Go to Login
        </button>
      )}
    </div>
  );
}
