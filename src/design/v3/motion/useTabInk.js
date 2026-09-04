import { useEffect, useState } from 'react'

// useTabInk(navRef, activeKey) — geometry for a sliding active-tab pill.
// The ink is a full-size layer behind the tab buttons clipped to the active
// button's box with clip-path (compositor-animated, no width/left layout
// animation). Buttons declare data-tab="<key>" and the nav is
// position:relative so offsetLeft/offsetWidth are nav-relative.
// Re-measures on active change, nav resize and font load; the first paint is
// applied without a transition so the ink never slides in from the corner.
// A passive effect (not layout): the ink is a child of the nav, and a child's
// layout effect runs before the parent's ref is attached.
export function useTabInk(navRef, activeKey) {
  const [rect, setRect] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const btn = nav.querySelector(`[data-tab="${activeKey}"]`)
      if (!btn) { setRect(null); return }
      setRect({ left: btn.offsetLeft, width: btn.offsetWidth, total: nav.scrollWidth || nav.clientWidth })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(nav)
    document.fonts?.ready?.then(measure).catch(() => {})
    return () => ro?.disconnect()
  }, [navRef, activeKey])

  useEffect(() => {
    if (rect && !ready) {
      const id = requestAnimationFrame(() => setReady(true))
      return () => cancelAnimationFrame(id)
    }
  }, [rect, ready])

  if (!rect) return { style: { opacity: 0 }, ready }
  const right = Math.max(0, rect.total - rect.left - rect.width)
  return {
    ready,
    style: { opacity: 1, clipPath: `inset(0 ${right}px 0 ${rect.left}px round 999px)` },
  }
}

