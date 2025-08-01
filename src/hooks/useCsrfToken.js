// src/hooks/useCsrfToken.js
import { useEffect, useState } from 'react';

export function useCsrfToken() {
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    async function getToken() {
      try {
        const res = await fetch('/api/csrf/csrf-token');
        const text = await res.text();
        if (res.ok) {
          const data = JSON.parse(text);
          setCsrfToken(data.csrfToken || '');
        } else {
          console.error('CSRF endpoint failed:', text);
        }
      } catch (err) {
        console.error('CSRF token fetch error:', err);
      }
    }
    getToken();
  }, []);

  return csrfToken;
}
