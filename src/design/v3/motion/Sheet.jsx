import { useRef } from 'react'
import { useDismiss } from './useDismiss.js'

// <Sheet onClose side="center|bottom"> — backdrop + panel with spring-in
// entrance, Escape and backdrop-click dismissal, scroll lock, focus handling.
// Callers own the panel's inner layout; pass panelStyle for size/colour.
export function Sheet({ onClose, children, side = 'center', zIndex = 60, backdrop, panelStyle, label, labelledBy, padding = 16 }) {
  const panelRef = useRef(null)
  useDismiss(onClose, panelRef)
  const bottom = side === 'bottom'
  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex, display: 'flex',
      alignItems: bottom ? 'flex-end' : 'center', justifyContent: 'center', padding: bottom ? 0 : padding }}>
      <div className="em-sheet-backdrop" onClick={onClose} aria-hidden style={{ position: 'absolute', inset: 0,
        background: backdrop || 'rgba(6,4,16,0.72)', backdropFilter: 'blur(10px) saturate(140%)', WebkitBackdropFilter: 'blur(10px) saturate(140%)' }}/>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy}
        tabIndex={-1} className="em-sheet-panel" data-side={side}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', outline: 'none', width: '100%', ...panelStyle }}>
        {children}
      </div>
    </div>
  )
}
