// app/layout.js
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
    <html lang={initialLang} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0b0b" />
      </head>
      <body className="bg-[#0B0B0B] text-white" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
