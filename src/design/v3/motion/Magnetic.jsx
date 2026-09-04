import { useRef } from 'react'
import { useMagnetic } from './useMagnetic.js'

// <PressScale> — wrapper for anything pressable that is not a <Btn> (Links
// around cards, icon buttons). Inline-flex by default so it hugs its child.
export function PressScale({ strength = 3, press = 0.97, lift = 0, sheen = false, style, className = '', children, ...rest }) {
  const ref = useRef(null)
  useMagnetic(ref, { strength, press, sheen, lift })
  return (
    <div ref={ref} className={`em-press ${className}`.trim()}
      style={{ display: 'inline-flex', position: 'relative', ...style }} {...rest}>
      {sheen && <span aria-hidden className="em-sheen"/>}
      {children}
    </div>
  )
}
