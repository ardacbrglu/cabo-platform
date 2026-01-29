import "./globals.css";
import { cookies } from "next/headers";
import Providers from "./providers";

/**
 * RootLayout
 * - Minimal head; theme-color fixed
 * - Locale from cookie only
 * - Body has no scrolling role (the scroller is <html>)
 *
 * Security Docblock (Cabo PROD)
 * - Server-side cookie read only (next/headers).
 * - Next.js 16+ uyumluluğu: cookies() async olabilir; await ile okunur.
 * - Cookie locale sadece allowlist (en|tr); aksi durumda "en" fallback.
 * - XSS/HTML injection yok: locale sadece lang attribute ve meta içine girer.
 */

export const metadata = {
  title: "Cabo",
  description: "Affiliate platform for monetization",
};

export default async function RootLayout({ children }) {
  const store = await cookies();
  const cookieLocale = store.get("locale")?.value;
  const initialLang = ["en", "tr"].includes(cookieLocale) ? cookieLocale : "en";

  return (
    <html lang={initialLang} suppressHydrationWarning translate="no" className="notranslate">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0b0b" />
        <meta name="google" content="notranslate" />
        <meta httpEquiv="Content-Language" content={initialLang} />
      </head>
      <body className="bg-[#0B0B0B] text-white" suppressHydrationWarning translate="no">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
