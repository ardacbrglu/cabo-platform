import dynamic from "next/dynamic";
import { Suspense } from "react";

const ActivateContent = dynamic(() => import("./Content"), { ssr: false });

export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="text-center text-white mt-20">...</div>}>
      <ActivateContent />
    </Suspense>
  );
}
