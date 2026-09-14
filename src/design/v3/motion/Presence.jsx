import { useState } from 'react'
import { PresenceContext } from './presence-context.js'
import { usePresence } from './usePresence.js'

// Keep the last actual child alive through dismissal. Its data, media and
// focus cleanup survive until the exit finishes; a rapid reopen cancels exit.
export function Presence({ children, kind = 'modal' }) {
  const [last, setLast] = useState(children)
  if (children && children !== last) setLast(children)
  const motion = usePresence(Boolean(children), kind)
  if (!motion.mounted) return null
  return <PresenceContext.Provider value={motion}>{children || last}</PresenceContext.Provider>
}

export function MotionDropdown({ open, className = '', children, ...props }) {
  const motion = usePresence(open, 'dropdown')
  if (!motion.mounted) return null
  return <div {...props} className={`t-dropdown ${motion.className} ${className}`}
    data-origin="top-right" data-motion-state={motion.phase} inert={motion.inert}>
    {children}
  </div>
}

export function Collapse({ open, children, className = '', id, style, contentStyle }) {
  return <div className={`t-acc em-collapse ${className}`} data-open={Boolean(open)} style={style}>
    <div className="t-acc-panel" id={id} inert={!open} aria-hidden={!open}>
      <div className="t-acc-panel-inner"><div style={contentStyle}>{children}</div></div>
    </div>
  </div>
}

export function IconSwap({ active, from, to, style }) {
  return <span className="t-icon-swap" data-state={active ? 'b' : 'a'} aria-hidden="true" style={style}>
    <span className="material-symbols-outlined t-icon" data-icon="a">{from}</span>
    <span className="material-symbols-outlined t-icon" data-icon="b">{to}</span>
  </span>
}
