// src/app/password_reset/page.js
/**
 * Security Docblock (Cabo PROD - UI Page)
 * - Public page that hosts password reset request/confirm UI
 * - Next.js 16+: searchParams is Promise in dynamic APIs → must be awaited
 * - No sensitive caching
 */

import PublicLayout from "@/components/PublicLayout";
import PasswordResetContent from "./Content";

export const metadata = {
  title: "Password Reset",
  description: "Request password reset or set a new password",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PasswordResetPage({ searchParams }) {
  // ✅ Next.js 16 (sync dynamic APIs): searchParams can be a Promise
  const sp = (searchParams && typeof searchParams.then === "function") ? await searchParams : (searchParams || {});

  const token = typeof sp?.token === "string" ? sp.token : "";
  const initialLang = typeof sp?.lang === "string" ? sp.lang : "";

  return (
    <PublicLayout>
      <PasswordResetContent token={token} initialLang={initialLang} />
    </PublicLayout>
  );
}
