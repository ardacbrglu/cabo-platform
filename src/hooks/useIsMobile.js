// /hooks/useIsMobile.js
/**
 * useIsMobile — mobil/touch durumu algılama
 * - width breakpoint (default 768)
 * - pointer:coarse (touch) tespiti
 * - SSR safe, event cleanup düzgün
 */
import { useEffect, useState } from "react";

export function useIsMobile(breakpoint = 768) {
  const [state, setState] = useState({
    isMobileWidth: false,
    isTouch: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      setState({ isMobileWidth: false, isTouch: false });
      return;
    }

    const mmWidth = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const mmTouch = window.matchMedia("(pointer: coarse)");

    const update = () => {
      setState({
        isMobileWidth: mmWidth.matches,
        isTouch: mmTouch.matches,
      });
    };

    update();

    // Modern tarayıcılar için addEventListener tercih edilir
    const onChange = () => update();
    mmWidth.addEventListener?.("change", onChange);
    mmTouch.addEventListener?.("change", onChange);

    // Fallback (eski tarayıcılar)
    if (!mmWidth.addEventListener) mmWidth.addListener?.(onChange);
    if (!mmTouch.addEventListener) mmTouch.addListener?.(onChange);

    return () => {
      mmWidth.removeEventListener?.("change", onChange);
      mmTouch.removeEventListener?.("change", onChange);
      if (!mmWidth.removeEventListener) mmWidth.removeListener?.(onChange);
      if (!mmTouch.removeEventListener) mmTouch.removeListener?.(onChange);
    };
  }, [breakpoint]);

  const isMobile = state.isMobileWidth || state.isTouch;
  return isMobile;
}
