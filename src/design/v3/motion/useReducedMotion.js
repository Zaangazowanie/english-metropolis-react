import { useEffect, useState } from 'react'

// True when motion should collapse to instant / opacity-only: the OS setting
// OR the in-app Settings → Animations choice (Settings.jsx writes
// <html data-motion="reduced|none"> through ThemeContext).
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false
  const html = document.documentElement.getAttribute('data-motion')
  if (html === 'reduced' || html === 'none') return true
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(prefersReducedMotion())
    mq.addEventListener('change', update)
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
    return () => { mq.removeEventListener('change', update); mo.disconnect() }
  }, [])
  return reduced
}

// Fine pointer + real hover: gate pointer-tracking effects so touch devices
// never get a stuck hover highlight.
export function hasFinePointer() {
  if (typeof window === 'undefined') return false
  return !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
}
