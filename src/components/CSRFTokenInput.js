// src/components/CSRFTokenInput.js
'use client';
import React from "react";
import { useCsrfToken } from "@/hooks/useCsrfToken";

export default function CSRFTokenInput() {
  const csrfToken = useCsrfToken();
  return <input type="hidden" name="csrfToken" value={csrfToken} />;
}
