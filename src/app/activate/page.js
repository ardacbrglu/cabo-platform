"use client";

import { Suspense } from "react";
import PublicLayout from "@/components/PublicLayout";
import ActivateContent from "./Content";

export default function Page() {
  return (
    <PublicLayout>
      <Suspense fallback={<div className="text-white text-center py-12">Yükleniyor...</div>}>
        <ActivateContent />
      </Suspense>
    </PublicLayout>
  );
}
