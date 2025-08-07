'use client';

import { Suspense } from 'react';
import ActivatedContent from './Content';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-white text-center py-12">Yükleniyor...</div>}>
      <ActivatedContent />
    </Suspense>
  );
}
