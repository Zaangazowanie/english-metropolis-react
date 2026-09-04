import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.js'

// useAnimatedValue(target) — eases from the CURRENT displayed value to the
// new target (not from zero), interruptible, rAF-driven, instant under
// reduced motion. Returns a number.
export function useAnimatedValue(target, { duration = 900 } = {}) {
  const to = Number(target) || 0
  const [val, setVal] = useState(to)
  const from = useRef(to)
  const raf = useRef(0)
  const reduced = useReducedMotion()
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    if (reduced) return
    const start = performance.now()
    const a = from.current
    const ease = (t) => 1 - Math.pow(1 - t, 4)
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const v = a + (to - a) * ease(p)
      from.current = v
      setVal(v)
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else { from.current = to; setVal(to) }
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [to, duration, reduced])
  // Reduced motion: the target is the value; nothing eases.
  return reduced ? to : val
}

