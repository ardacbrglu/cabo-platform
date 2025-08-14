import "./globals.css";
import { cookies } from "next/headers";
import Providers from "./providers";           // <- dosya adı küçük harfle
import { UserProvider } from "@/context/UserContext";
import { LocaleProvider } from "@/context/LocaleContext";

export const metadata = {
  title: "Cabo",
  description: "Affiliate platform for monetization",
};

export default function RootLayout({ children }) {
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get("locale")?.value;
  const initialLang = ["en", "tr"].includes(cookieLocale) ? cookieLocale : "en";

  return (
    <html lang={initialLang} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0b0b0b" />
      </head>
      <body className="bg-[#0B0B0B] text-white">
        <Providers>
          <LocaleProvider>
            <UserProvider>{children}</UserProvider>
          </LocaleProvider>
        </Providers>
      </body>
    </html>
  );
}
