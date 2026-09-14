import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.js'

// Read the same semantic duration that CSS uses, including second units.
export function motionDuration(name, fallback) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const number = parseFloat(value)
  return Number.isFinite(number) ? number * (value.endsWith('ms') ? 1 : 1000) : fallback
}

export function usePresence(open, kind = 'modal') {
  const reduced = useReducedMotion()
  const [mounted, setMounted] = useState(Boolean(open))
  const [entered, setEntered] = useState(false)
  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (!mounted) return
    let first = 0, second = 0, timer = 0
    if (open) {
      // Commit the pre-open style before moving to the resting position.
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setEntered(true))
      })
    } else {
      const token = kind === 'drawer' ? '--panel-close-dur' : `--${kind}-close-dur`
      const fallback = kind === 'drawer' || kind === 'toast' ? 350 : 150
      timer = window.setTimeout(() => { setMounted(false); setEntered(false) }, reduced ? 0 : motionDuration(token, fallback))
    }
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      window.clearTimeout(timer)
    }
  }, [open, mounted, kind, reduced])

  const phase = !open ? 'closing' : (entered || reduced ? 'open' : 'entering')
  return { mounted, phase, className: phase === 'open' ? 'is-open' : phase === 'closing' ? 'is-closing' : '', inert: !open }
}
