'use client';
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function Portal({ children }) {
  // SSR hatası olmaması için, elRef window'da tanımlanır
  const elRef = useRef(
    typeof window !== "undefined" ? document.createElement("div") : null
  );

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    document.body.appendChild(el);
    return () => { document.body.removeChild(el); };
  }, []);

  // window/DOM yoksa (SSR), null döndür
  return elRef.current ? createPortal(children, elRef.current) : null;
}
