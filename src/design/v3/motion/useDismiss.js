import { useEffect } from 'react'

// useDismiss(onClose) — Escape closes; body scroll locks while open; focus
// moves into the panel and returns to the opener on close.
export function useDismiss(onClose, panelRef) {
  useEffect(() => {
    const opener = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const id = requestAnimationFrame(() => {
      const p = panelRef?.current
      if (p && !p.contains(document.activeElement)) {
        const target = p.querySelector('[autofocus], input, button, [tabindex]:not([tabindex="-1"])') || p
        target.focus?.({ preventScroll: true })
      }
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      cancelAnimationFrame(id)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [onClose, panelRef])
}

