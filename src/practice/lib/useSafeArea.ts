// useSafeArea.ts — iOS safe area insets + mobile utilities.
// Handles env(safe-area-inset-*) for notch/Dynamic Island devices,
// keyboard resize issues, and orientation warnings.

import { useEffect, useState } from 'react';

// ─── Safe Area Insets ───────────────────────────────────────────────────────
// Reads CSS env() safe-area-inset-* values via a hidden sentinel element.
// Falls back to 0 on non-iOS or when not in a standalone PWA.

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Hook that provides real-time iOS safe area insets.
 * Updates on orientation change and resize.
 */
export function useSafeArea(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 });

  useEffect(() => {
    // Create sentinel to measure env() values
    const sentinel = document.createElement('div');
    sentinel.style.cssText = `
      position: fixed; top: 0; left: 0; width: 0; height: 0;
      pointer-events: none; visibility: hidden; z-index: -1;
      padding: env(safe-area-inset-top) env(safe-area-inset-right)
               env(safe-area-inset-bottom) env(safe-area-inset-left);
    `;
    document.body.appendChild(sentinel);

    const measure = () => {
      const cs = window.getComputedStyle(sentinel);
      setInsets({
        top: parseInt(cs.paddingTop, 10) || 0,
        right: parseInt(cs.paddingRight, 10) || 0,
        bottom: parseInt(cs.paddingBottom, 10) || 0,
        left: parseInt(cs.paddingLeft, 10) || 0,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      document.body.removeChild(sentinel);
    };
  }, []);

  return insets;
}

// ─── Viewport Height (iOS keyboard fix) ─────────────────────────────────────
// iOS Safari resizes the visual viewport when the keyboard opens, but
// window.innerHeight stays the layout viewport. This hook uses
// visualViewport.height when available for accurate height.

export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800
  );

  useEffect(() => {
    const update = () => {
      // visualViewport is the modern API; falls back to innerHeight.
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setHeight(vh);
    };

    update();

    // visualViewport fires resize events for keyboard open/close
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', update);
      return () => vv.removeEventListener('resize', update);
    } else {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
  }, []);

  return height;
}

// ─── Orientation Warning ────────────────────────────────────────────────────
// Shows a warning overlay when the device is in landscape on mobile.
// Call in the root App component.

export function useOrientationLock(): { isLandscape: boolean; isMobile: boolean } {
  const [isLandscape, setIsLandscape] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const landscape = window.matchMedia('(orientation: landscape)').matches;
      setIsMobile(mobile);
      setIsLandscape(mobile && landscape);
    };

    check();
    const mq = window.matchMedia('(orientation: landscape)');
    mq.addEventListener('change', check);
    window.addEventListener('resize', check);

    return () => {
      mq.removeEventListener('change', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  return { isLandscape, isMobile };
}
