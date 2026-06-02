// usePrefersReducedMotion — Kelly audit Tier-2 (2026-05-02).
// CSS-side `@media (prefers-reduced-motion: reduce)` rules in styles/global.css
// cover keyframe + transition animations, but JS-driven motion (rAF loops,
// setInterval visual ticks, setTimeout-sequenced fades) ignores the OS
// preference. This hook lets shells gate those JS motion sites.
//
// Subscribes to the matchMedia change event so toggling the OS pref re-renders
// the consuming component without a page reload.
//
// Usage:
//   const reduce = usePrefersReducedMotion();
//   useEffect(() => {
//     if (reduce) { /* snap to final frame, skip rAF loop */ return; }
//     const id = requestAnimationFrame(tick);
//     return () => cancelAnimationFrame(id);
//   }, [reduce]);
import { useEffect, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent): void => setReduce(e.matches);
    // Safari < 14 only supports the legacy addListener API.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      // @ts-expect-error legacy addListener fallback
      mq.addListener(handler);
      // @ts-expect-error legacy removeListener fallback
      return () => mq.removeListener(handler);
    }
  }, []);
  return reduce;
}
