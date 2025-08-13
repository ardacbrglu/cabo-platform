// app/activate/page.js
import { Suspense } from "react";
import PublicLayout from "@/components/PublicLayout";
import ActivateContent from "./Content";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <PublicLayout>
      <Suspense fallback={<div className="text-white text-center py-12">Yükleniyor...</div>}>
        <ActivateContent />
      </Suspense>
    </PublicLayout>
  );
}
