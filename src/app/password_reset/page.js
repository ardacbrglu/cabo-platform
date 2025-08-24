// src/app/password_reset/page.js
import PublicLayout from "@/components/PublicLayout";
import PasswordResetContent from "./Content";

export const metadata = {
  title: "Password Reset",
  description: "Request password reset or set a new password",
};

export default function PasswordResetPage({ searchParams }) {
  const token =
    typeof searchParams?.token === "string" ? searchParams.token : "";
  const initialLang =
    typeof searchParams?.lang === "string" ? searchParams.lang : "";

  return (
    <PublicLayout>
      <PasswordResetContent token={token} initialLang={initialLang} />
    </PublicLayout>
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
