import "./globals.css";
import { cookies } from "next/headers";
import Providers from "./providers";

export const metadata = {
  title: "Cabo",
  description: "Affiliate platform for monetization",
};

export default function RootLayout({ children }) {
  const cookieLocale = cookies().get("locale")?.value;
  const initialLang = ["en", "tr"].includes(cookieLocale) ? cookieLocale : "en";

  return (
    <html
      lang={initialLang}
      suppressHydrationWarning
      translate="no"                 // Sayfa çevirisini kapat
      className="notranslate"        // Bazı eklentiler için ek işaret
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0b0b" />
        <meta name="google" content="notranslate" />           {/* Chrome/Google translate kapat */}
        <meta httpEquiv="Content-Language" content={initialLang} />
      </head>

      {/* Body: min-h viewport + flex-col → footer dipte */}
      <body
        className="min-h-[100dvh] flex flex-col bg-[#0B0B0B] text-white"
        suppressHydrationWarning
        translate="no"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
