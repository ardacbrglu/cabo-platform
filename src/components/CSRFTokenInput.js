'use client';
import React from "react";
import { useCsrfToken } from "@/hooks/useCsrfToken";

export default function usecsrf_token() {
  const csrf_token = usecsrf_token();
  return <input type="hidden" name="csrf_token" value={csrf_token} />;
  //    -------------------     ^^^^^^^^^^^
  //    DİKKAT: input name ile cookie adı BİREBİR aynı olmalı!
}
