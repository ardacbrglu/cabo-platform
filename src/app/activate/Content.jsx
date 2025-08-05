//activate/Content.js
'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/context/LocaleContext';
import { usePathname } from 'next/navigation';
import { notFound } from 'next/navigation';

export default function ContentWrapper({ children }) {
  const { ready, locale } = useLocale();
  const pathname = usePathname();
  const [validLocale, setValidLocale] = useState(true);

  useEffect(() => {
    const segments = pathname.split('/');
    const currentLocale = segments[1];
    if (currentLocale && !['tr', 'en'].includes(currentLocale)) {
      setValidLocale(false);
    }
  }, [pathname]);

  if (!ready) return null;
  if (!validLocale) return notFound();

  return <>{children}</>;
}
