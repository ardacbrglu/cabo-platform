// ✅ FRONTEND: app/activate/page.js
import { Suspense } from "react";
import PublicLayout from "@/components/PublicLayout";
import ActivateContent from "./content";

export default function ActivatePage() {
  return (
    <PublicLayout>
      <Suspense fallback={<div className="text-center mt-16 text-gray-300">Yükleniyor...</div>}>
        <ActivateContent />
      </Suspense>
    </PublicLayout>
  );
}
