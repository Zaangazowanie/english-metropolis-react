import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from './useDismiss.js'
import { usePresence } from './usePresence.js'
import { usePresenceContext } from './presence-context.js'

// <Sheet onClose side="center|bottom"> — backdrop + panel with reversible
// entrance, Escape and backdrop-click dismissal, scroll lock, focus handling.
// Callers own the panel's inner layout; pass panelStyle for size/colour.
export function Sheet({ onClose, children, side = 'center', zIndex = 60, backdrop, panelStyle, panelClassName = '', label, labelledBy, padding = 16 }) {
  const panelRef = useRef(null)
  const parentMotion = usePresenceContext()
  const ownMotion = usePresence(true, side === 'bottom' ? 'drawer' : 'modal')
  const motion = parentMotion || ownMotion
  useDismiss(onClose, panelRef, !motion.inert)
  const bottom = side === 'bottom'
  // A transformed page/card cannot become the dialog's containing block.
  return createPortal(
    <div role="presentation" data-motion-state={motion.phase} style={{ position: 'fixed', inset: 0, zIndex, display: 'flex',
      alignItems: bottom ? 'flex-end' : 'center', justifyContent: 'center', padding: bottom ? 0 : padding }}>
      <div className="em-sheet-backdrop" onClick={motion.inert ? undefined : onClose} aria-hidden style={{ position: 'absolute', inset: 0,
        background: backdrop || 'rgba(6,4,16,0.72)', backdropFilter: 'blur(10px) saturate(140%)', WebkitBackdropFilter: 'blur(10px) saturate(140%)' }}/>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy}
        tabIndex={-1} className={`em-sheet-panel ${bottom ? 'em-motion-drawer' : 't-modal'} ${motion.className} ${panelClassName}`} data-side={side} inert={motion.inert}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', outline: 'none', width: '100%', ...panelStyle }}>
        {children}
      </div>
    </div>, document.body
  )
}
