"use client";

import { useEffect, useState } from "react";

/**
 * Viewport-width media-query hook. Initialised to `false` so SSR and the
 * first client render match (no hydration mismatch); the actual value is
 * set on mount via `useEffect`. Updates live as the viewport resizes.
 *
 * Pass the desktop-breakpoint width — true means "narrower than that".
 *
 * Prefer this only for things that can't be done with Tailwind responsive
 * classes (e.g. swapping component trees that share no markup).
 */
export function useIsMobile(desktopBreakpointPx = 1024): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${desktopBreakpointPx - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [desktopBreakpointPx]);

  return isMobile;
}
