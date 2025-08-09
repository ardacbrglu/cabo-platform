// app/layout.js
import "./globals.css";
import { cookies } from "next/headers";
import { UserProvider } from "@/context/UserContext";
import { LocaleProvider } from "@/context/LocaleContext";

// Bu metadata objesi Next.js tarafından otomatik head'e yazılır
export const metadata = {
  title: "Cabo",
  description: "Affiliate platform for monetization",
};

/**
 * SECURITY/UX NOTES:
 * - Dil (lang) SSR'da cookie "locale" ile başlatılır → hydration uyumu.
 * - CSP, güvenlik başlıkları middleware/headers üzerinden verilmeli (layout'a koymuyoruz).
 */
export default function RootLayout({ children }) {
  // SSR: locale cookie → "en" fallback
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get("locale")?.value;
  const initialLang = ["en", "tr"].includes(cookieLocale) ? cookieLocale : "en";

  return (
    <html lang={initialLang} suppressHydrationWarning>
      <head>
        {/* Mobil uyum */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* Tema rengi (PWA/UX) */}
        <meta name="theme-color" content="#0b0b0b" />
        {/* İstersen favicon: <link rel="icon" href="/favicon.ico" /> */}
      </head>
      <body className="bg-[#0B0B0B] text-white">
        {/* LocaleProvider client'ta localStorage + <html lang> günceller */}
        <LocaleProvider>
          <UserProvider>{children}</UserProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
