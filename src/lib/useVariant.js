import { useState } from 'react'

// Pick one item from a pool per page load. A refresh gets a different image;
// re-renders keep the one already chosen, so nothing swaps under the visitor
// mid-session. Used by the hero slider and by any other image slot that has a
// pool behind it rather than a single fixed file.
export function useVariant(pool) {
  const [pick] = useState(() => pool[Math.floor(Math.random() * pool.length)])
  return pick
}
