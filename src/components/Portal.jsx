'use client';
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Portal – SSR-safe
 * - İlk render’da window yoksa null döner
 * - Mount olduğunda body'e bir div ekler, unmount'ta temizler
 */
export default function Portal({ children }) {
  const elRef = useRef(null);

  // SSR sırasında document yok; client'ta bir kere oluştur
  if (typeof window !== "undefined" && elRef.current === null) {
    elRef.current = document.createElement("div");
  }

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    document.body.appendChild(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  return elRef.current ? createPortal(children, elRef.current) : null;
}
