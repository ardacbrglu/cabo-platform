// app/providers.jsx
"use client";

import { SessionProvider } from "next-auth/react";
import { LocaleProvider } from "@/context/LocaleContext";
import { UserProvider } from "@/context/UserContext";

export default function Providers({ children }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <LocaleProvider>
        <UserProvider>{children}</UserProvider>
      </LocaleProvider>
    </SessionProvider>
  );
}
