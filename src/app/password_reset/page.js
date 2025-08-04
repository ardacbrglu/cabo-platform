"use client";
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import PasswordResetInner from "./password-reset-inner";

export default function PasswordResetPage() {
  return (
    <Suspense>
      <PasswordResetInner />
    </Suspense>
  );
}
