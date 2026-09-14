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
// The same live preference now drives marketing, app motion and game UI.
import { useReducedMotion } from '../../design/v3/motion/useReducedMotion.js';
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion();
}
