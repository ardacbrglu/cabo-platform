'use client';
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "@/hooks/useTranslation";

export default function ActivatedContent() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");
  const lang = params.get("lang");
  const email = params.get("email") || "";
  const { setLocale } = useLocale();
  const t = useTranslation();

  const emailInputRef = useRef(null);

  useEffect(() => {
    if (lang) setLocale(lang);
  }, [lang, setLocale]);

  function handleLoginSubmit(e) {
    e.preventDefault();
    const emailValue = emailInputRef.current.value;
    const passwordValue = e.target.password.value;

    // Otomatik giriş için login sayfasına email ile yönlendir (şifreyi post edemeyiz, güvenli olmaz)
    router.replace(`/login?email=${encodeURIComponent(emailValue)}&from=activated`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      {error ? (
        <div className="text-red-400 text-lg">{t("activationFailed") || "Aktivasyon başarısız veya link geçersiz."}</div>
      ) : (
        <>
          <div className="text-green-400 text-lg mb-6">
            {t("activationSuccess") || "Aktivasyon başarılı! Şimdi giriş yapabilirsin."}
          </div>
          {/* LOGIN FORM */}
          <form
            className="w-full max-w-xs bg-[#232323] rounded-xl p-6"
            style={{ margin: "0 auto" }}
            autoComplete="on"
            onSubmit={handleLoginSubmit}
          >
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              className="w-full mb-4 rounded bg-[#181818] px-4 py-3 text-gray-100 border border-[#444]"
              value={email}
              readOnly
              tabIndex={-1}
            />
            <input
              type="password"
              name="password"
              autoFocus
              autoComplete="current-password"
              placeholder={t("password") || "Şifreniz"}
              className="w-full mb-4 rounded bg-[#181818] px-4 py-3 text-gray-100 border border-[#444]"
              required
            />
            <button
              type="submit"
              className="w-full py-3 bg-[#81d742] text-[#111] font-semibold rounded hover:bg-[#aaff6c] transition"
            >
              {t("loginLink") || "Giriş yap"}
            </button>
          </form>
          <div className="text-gray-400 text-sm mt-4">
            {t("activatedNext") || "Aşağıdaki form ile hemen giriş yapabilirsin."}
          </div>
        </>
      )}
    </div>
  );
}
