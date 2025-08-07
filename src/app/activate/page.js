'use client';

import { Suspense } from 'react';
import ActivateContent from './Content';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-white text-center py-12">Yükleniyor...</div>}>
      <ActivateContent />
    </Suspense>
  );
}

