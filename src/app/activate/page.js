'use client';

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";

function ActivateContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [message, setMessage] = useState("Verifying...");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!token) {
      setMessage("Invalid activation link.");
      setStatus("error");
      return;
    }

    fetch(`/api/activate?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMessage("Your account has been activated. You can now log in.");
          setStatus("success");
        } else {
          setMessage(data.message || "Activation failed or link expired.");
          setStatus("error");
        }
      })
      .catch(() => {
        setMessage("An unexpected error occurred.");
        setStatus("error");
      });
  }, [token]);

  return (
    <PublicLayout>
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className={`max-w-md w-full text-center p-6 rounded-xl border ${status === "success" ? "border-green-500" : "border-red-500"} text-white`}>
          <h2 className="text-2xl font-bold mb-4">Account Activation</h2>
          <p className="text-lg">{message}</p>
        </div>
      </div>
    </PublicLayout>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="text-center text-white mt-20">Loading...</div>}>
      <ActivateContent />
    </Suspense>
  );
}
