import { useEffect, useRef } from 'react'

const overlays = []
const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
let previousOverflow = ''

// Only the top dialog handles Escape/Tab. Callback changes must not refocus
// a form on every keystroke, and closing a nested dialog keeps scroll locked.
export function useDismiss(onClose, panelRef, active = true) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement
    const entry = { panelRef }
    if (!overlays.length) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    overlays.push(entry)
    const items = () => [...(panelRef.current?.querySelectorAll(focusable) || [])]
      .filter(el => !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
    const onKey = event => {
      if (overlays.at(-1) !== entry) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close.current?.()
      } else if (event.key === 'Tab') {
        const nodes = items(), first = nodes[0], last = nodes.at(-1)
        if (!first) { event.preventDefault(); panelRef.current?.focus(); return }
        if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (panel && !panel.contains(document.activeElement)) {
        (panel.querySelector('[autofocus]') || items()[0] || panel).focus({ preventScroll: true })
      }
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(id)
      const wasTop = overlays.at(-1) === entry
      overlays.splice(overlays.indexOf(entry), 1)
      if (!overlays.length) document.body.style.overflow = previousOverflow
      if (wasTop && opener?.isConnected && !opener.closest('[inert]')) opener.focus?.({ preventScroll: true })
    }
  }, [active, panelRef])
}

