// A PLN amount that counts to its new value when it changes (cart edits, the
// add-on toggled) instead of snapping. The visible run of digits is aria-hidden
// and the settled amount is announced once through a visually-hidden span, so a
// screen reader hears "1 760 PLN" and never a stream of intermediate numbers.
// Honours prefers-reduced-motion by snapping. Never animates on first paint:
// a total that "loads in" by counting reads as a computation, not a price.
import { useEffect, useRef, useState } from 'react'
import { formatPLN } from './cart-store.js'

const DURATION = 420
const EASE = (t) => 1 - Math.pow(1 - t, 3)

export default function AnimatedMoney({ value, className = '' }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const current = useRef(value)
  const frame = useRef(0)

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = from.current
    if (start === value) return undefined
    const t0 = performance.now()
    const tick = (now) => {
      const p = reduce ? 1 : Math.min(1, (now - t0) / DURATION)
      const next = start + (value - start) * EASE(p)
      current.current = p === 1 ? value : Math.round(next)
      setShown(current.current)
      if (p < 1) frame.current = requestAnimationFrame(tick)
      else from.current = value
    }
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(tick)
    // Interrupted mid-count (a second edit): resume from what is on screen.
    return () => { cancelAnimationFrame(frame.current); from.current = current.current }
  }, [value])

  return (
    <span className={`money ${className}`.trim()}>
      <span aria-hidden="true">{formatPLN(shown)}</span>
      <span className="sr-only">{formatPLN(value)}</span>
    </span>
  )
}
