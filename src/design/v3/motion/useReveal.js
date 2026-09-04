import { useCallback, useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.js'

// useReveal — staggered list reveal driven by IntersectionObserver.
//   const rv = useReveal({ stagger: 40, cap: 8 })
//   <div {...rv.container}> {items.map((x, i) => <Card {...rv.item(i)}/>)} </div>
// Items start at opacity 0 / translateY(10px) and settle when the container
// scrolls into view; delay = min(i, cap) * stagger so a 60-item list never
// waits more than ~320ms. Reduced motion: everything is visible at once.
// The container becomes visible immediately when IntersectionObserver is
// missing, so content can never be stranded invisible.
export function useReveal({ stagger = 40, cap = 8, rootMargin = '0px 0px -8% 0px' } = {}) {
  // Callback ref: the container often mounts AFTER the hook (a skeleton is
  // shown first), so observing must start when the node attaches, not on the
  // hook's first effect.
  const [el, setEl] = useState(null)
  const ref = useCallback((node) => setEl(node), [])
  const reduced = useReducedMotion()
  // Reduced motion or no IntersectionObserver: visible from the first render.
  const [inView, setInView] = useState(() => reduced || typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (inView) return
    if (!el) return
    if (reduced) { const id = requestAnimationFrame(() => setInView(true)); return () => cancelAnimationFrame(id) }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setInView(true); io.disconnect() }
    }, { rootMargin, threshold: 0.01 })
    io.observe(el)
    // Safety: a container that never intersects (display swaps, tabs hidden
    // behind an overlay) still reveals after a beat rather than staying blank.
    const safety = window.setTimeout(() => setInView(true), 1600)
    return () => { io.disconnect(); window.clearTimeout(safety) }
  }, [inView, reduced, rootMargin, el])

  return {
    inView,
    container: { ref, className: inView ? 'em-reveal em-reveal-in' : 'em-reveal' },
    item: (i = 0, extraStyle) => ({
      className: 'em-reveal-item',
      style: { '--em-reveal-delay': `${Math.min(i, cap) * stagger}ms`, ...(extraStyle || {}) },
    }),
  }
}

