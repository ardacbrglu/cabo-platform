import { useState, useEffect } from "react";

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function checkMobile() {
      // SSR veya non-browser ortamda guard
      if (typeof window === "undefined" || typeof navigator === "undefined") {
        setIsMobile(false);
        return;
      }
      const widthMobile = window.innerWidth <= breakpoint;
      // User agent check (daha hassas, Android/iOS ve bazı tabletleri de kapsar)
      const ua = navigator.userAgent || "";
      const isUserAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i.test(ua);
      // Sadece mobil tarayıcıdan mı, yoksa küçük ekrandan mı geldik?
      setIsMobile(widthMobile || isUserAgentMobile);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    // orientation değişirse de kontrol et (mobilde ekran döndürme)
    window.addEventListener("orientationchange", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
      window.removeEventListener("orientationchange", checkMobile);
    };
  }, [breakpoint]);

  return isMobile;
}
