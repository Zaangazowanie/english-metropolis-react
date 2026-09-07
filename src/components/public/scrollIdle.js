// Shared "is the page scrolling right now?" flag for decorative render loops.
// The hero skyline and the shader field both render on requestAnimationFrame;
// while the visitor scrolls, that work competes with compositing and the page
// stutters (Mike 2026-09-07: "sluggish on scrolling"). Loops call isScrolling()
// and skip their frame until the wheel has been still for IDLE_MS.
const IDLE_MS = 140
let lastScroll = -Infinity
let bound = false

function bind() {
  if (bound || typeof window === 'undefined') return
  bound = true
  const mark = () => { lastScroll = performance.now() }
  window.addEventListener('scroll', mark, { passive: true, capture: true })
  window.addEventListener('wheel', mark, { passive: true })
  window.addEventListener('touchmove', mark, { passive: true })
}

export function isScrolling() {
  bind()
  return performance.now() - lastScroll < IDLE_MS
}

export { IDLE_MS as SCROLL_IDLE_MS }
