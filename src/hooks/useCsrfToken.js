// src/hooks/usecsrf_token.js
import { useEffect, useState } from 'react';

export function usecsrf_token() {
  const [csrf_token, setcsrf_token] = useState('');

  useEffect(() => {
    async function getToken() {
      try {
        const res = await fetch('/api/csrf/csrf-token');
        const text = await res.text();
        if (res.ok) {
          const data = JSON.parse(text);
          setcsrf_token(data.csrf_token || '');
        } else {
          console.error('CSRF endpoint failed:', text);
        }
      } catch (err) {
        console.error('CSRF token fetch error:', err);
      }
    }
    getToken();
  }, []);

  return csrf_token;
}
