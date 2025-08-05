'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PublicLayout from "@/components/PublicLayout";
import { useCsrfToken } from "@/hooks/useCsrfToken";

export default function PasswordResetPage() {
  const [step, setStep] = useState("request"); // "request" | "confirm"
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const csrfToken = useCsrfToken();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  // Eğer link ile gelmişse, otomatik confirm stepe geç
  useEffect(() => {
    if (token) setStep("confirm");
  }, [token]);

  // EMAIL İLE RESET TOKEN İSTEĞİ
  const handleRequest = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/password_reset/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess("If user exists, password reset email sent.");
      } else {
        setError(data.message || "Failed to send reset email.");
      }
    } catch {
      setError("Server error.");
    } finally {
      setLoading(false);
    }
  };

  // YENİ ŞİFRE BELİRLEME
  const handleConfirm = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!pw || !pw2) {
      setError("Please fill all fields.");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }
    if (pw.length < 8 || !/\d/.test(pw) || !/[a-zA-Z]/.test(pw)) {
      setError("Password must be at least 8 characters, with letters and numbers.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/password_reset/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken || "",
        },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess("Password successfully changed. Redirecting...");
        setTimeout(() => router.replace("/login"), 2000);
      } else {
        setError(data.message || "Failed to reset password.");
      }
    } catch {
      setError("Server error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md bg-[#161a16] border border-[#252925] rounded-2xl shadow-xl p-10">
          {step === "request" ? (
            <>
              <h2 className="text-2xl font-bold mb-4 text-[#d1ffd0]">Forgot your password?</h2>
              <form onSubmit={handleRequest} className="flex flex-col gap-4">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                />
                {error && <div className="text-red-500 text-center">{error}</div>}
                {success && <div className="text-green-400 text-center">{success}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-lg font-semibold bg-[#81d742] text-[#111] rounded-lg hover:bg-[#b3ffb3] transition"
                >
                  {loading ? "Sending..." : "Send Reset Email"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-4 text-[#d1ffd0]">Set a new password</h2>
              <form onSubmit={handleConfirm} className="flex flex-col gap-4">
                <input
                  type="password"
                  placeholder="New password"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                />
                <input
                  type="password"
                  placeholder="Repeat new password"
                  value={pw2}
                  onChange={e => setPw2(e.target.value)}
                  required
                  className="w-full rounded-lg bg-white text-black border border-[#232323] px-4 py-3 text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#81d742]"
                />
                {error && <div className="text-red-500 text-center">{error}</div>}
                {success && <div className="text-green-400 text-center">{success}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-lg font-semibold bg-[#81d742] text-[#111] rounded-lg hover:bg-[#b3ffb3] transition"
                >
                  {loading ? "Saving..." : "Set Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
