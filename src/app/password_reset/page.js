'use client';
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import PasswordResetContent from "./PasswordResetContent";

export default function PasswordResetPage() {
  return (
    <Suspense fallback={null}>
      <PasswordResetContent />
    </Suspense>
  );
}
