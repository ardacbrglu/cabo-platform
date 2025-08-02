import { useState, useEffect } from "react";

// Kullanım: const isMobile = useIsMobile(); // 768px altında true döner
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function checkMobile() {
      // Hem width hem de user-agent kontrolü (Android/IOS için)
      const isUserAgentMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
      setIsMobile(window.innerWidth <= breakpoint || isUserAgentMobile);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [breakpoint]);

  return isMobile;
}
