import "./globals.css";
import { cookies } from "next/headers";
import Providers from "./providers";

/**
 * Security Docblock (RootLayout)
 * - No inline scripts; CSP set server-side in headers middleware
 * - Locale read from cookie only; no query param trust
 * - Viewport/meta kept minimal; theme-color fixed
 */
export const metadata = {
  title: "Cabo",
  description: "Affiliate platform for monetization",
};

export default function RootLayout({ children }) {
  const cookieLocale = cookies().get("locale")?.value;
  const initialLang = ["en", "tr"].includes(cookieLocale) ? cookieLocale : "en";

  return (
    <html lang={initialLang} suppressHydrationWarning translate="no" className="notranslate">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0b0b" />
        <meta name="google" content="notranslate" />
        <meta httpEquiv="Content-Language" content={initialLang} />
      </head>
      <body
        className="bg-[#0B0B0B] text-white"
        suppressHydrationWarning
        translate="no"
        data-mobile-hover="off"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
