"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "@/hooks/useTranslation";

export default function ActivateContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const t = useTranslation();
  const { ready } = useLocale();

  const [message, setMessage] = useState(t("activating"));
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setMessage(t("activation.invalid"));
      return;
    }

    fetch(`/api/activate?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMessage(t("activation.success"));
          setSuccess(true);
        } else {
          setMessage(t("activation.fail") + ": " + data.message);
        }
      })
      .catch(() => setMessage(t("activation.error")));
  }, [token, ready]);

  if (!ready) return null;

  return (
    <div className="max-w-md mx-auto mt-20 text-center text-white px-4">
      <h2 className="text-2xl font-bold mb-4">{t("activation.title")}</h2>
      <p className="mb-6">{message}</p>
      {success && (
        <Link href="/login" className="text-[#81d742] underline">
          {t("activation.loginLink")}
        </Link>
      )}
    </div>
  );
}
