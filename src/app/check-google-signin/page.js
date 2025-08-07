"use client";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useLocale } from "@/context/LocaleContext"; // senin context'in

export default function CheckGoogleSignin() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // 1. Öncelik: URL'de varsa onu kullan, yoksa Context'ten al
  const urlLang = params.get("lang");
  // Context ile uyumlu
  const { locale } = useLocale();

  const lang = urlLang || locale || "en";

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace(`/login?lang=${lang}`);
      return;
    }
    if (
      session.user.status === "pending" &&
      (!session.user.passwordHash || session.user.passwordHash === "")
    ) {
      router.replace(`/create-password?lang=${lang}`);
    } else {
      router.replace(`/dashboard?lang=${lang}`);
    }
  }, [status, session, router, lang]);

  return (
    <div className="text-center py-12 text-white">
      {status === "loading"
        ? lang === "tr"
          ? "Yükleniyor..."
          : "Loading..."
        : lang === "tr"
        ? "Hesabınız kontrol ediliyor..."
        : "Checking your account..."}
    </div>
  );
}
