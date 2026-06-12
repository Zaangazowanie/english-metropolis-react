import { useEffect, useRef } from 'react'

export interface GameLoopOptions {
  /** Fixed logic step in milliseconds (default 1000/60 ≈ 16.67ms). */
  stepMs?: number
  /** Pause the loop without unmounting (menu open, round transition). When
   *  false the loop keeps a (browser-throttled) rAF alive but runs no
   *  update/render. Default true. */
  running?: boolean
  /** Max catch-up steps per frame — bounds the "spiral of death" after a
   *  long stall. Default 5. */
  maxSubSteps?: number
  /** When true, catch-up is capped to a single step so motion reads as
   *  discrete rather than fast-forwarded — pair with prefers-reduced-motion. */
  reducedMotion?: boolean
}

export interface GameLoopApi {
  /** Whether the loop ticked logic on the last frame (false while paused or
   *  the tab is hidden). */
  isRunning: () => boolean
}

/**
 * Fixed-timestep game loop on requestAnimationFrame.
 *
 * Logic (`update`) advances in deterministic fixed steps independent of the
 * display refresh rate; `render(alpha)` runs once per frame with the 0..1
 * interpolation factor for smooth presentation. The loop auto-pauses when the
 * tab is hidden or the window loses focus and resets its clock on resume, so
 * there is no giant dt jump. It is allocation-free per frame — keep your own
 * callbacks allocation-free too.
 *
 * Framework-agnostic: usable inside or outside an r3f Canvas (it does not use
 * three's render loop, so games keep full control of their logic clock).
 */
export function useGameLoop(
  update: (stepSec: number) => void,
  render?: (alpha: number) => void,
  options: GameLoopOptions = {},
): GameLoopApi {
  const updateRef = useRef(update)
  const renderRef = useRef(render)
  const optsRef = useRef(options)
  updateRef.current = update
  renderRef.current = render
  optsRef.current = options

  const activeRef = useRef(false)

  useEffect(() => {
    let rafId = 0
    let last = 0
    let acc = 0
    let disposed = false
    let focused = typeof document === 'undefined' ? true : !document.hidden

    const shouldRun = (): boolean =>
      !disposed && focused && optsRef.current.running !== false

    const tick = (now: number): void => {
      rafId = requestAnimationFrame(tick)

      const o = optsRef.current
      const stepMs = o.stepMs && o.stepMs > 0 ? o.stepMs : 1000 / 60
      const stepSec = stepMs / 1000

      if (!shouldRun()) {
        last = 0
        acc = 0
        activeRef.current = false
        return
      }
      activeRef.current = true

      if (last === 0) last = now
      let frame = now - last
      last = now
      // Clamp pathological frames (tab refocus, debugger pause) to one step.
      if (frame > 250) frame = stepMs
      acc += frame

      const cap = o.reducedMotion ? 1 : o.maxSubSteps && o.maxSubSteps > 0 ? o.maxSubSteps : 5
      let steps = 0
      while (acc >= stepMs && steps < cap) {
        updateRef.current(stepSec)
        acc -= stepMs
        steps++
      }
      // Drop any backlog beyond the cap so we don't fast-forward later.
      if (acc >= stepMs) acc %= stepMs

      const r = renderRef.current
      if (r) r(acc / stepMs)
    }

    const onVisibility = (): void => {
      focused = !document.hidden
      if (focused) last = 0
    }
    const onBlur = (): void => {
      focused = false
    }
    const onFocus = (): void => {
      focused = true
      last = 0
    }

    rafId = requestAnimationFrame(tick)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', onBlur)
      window.addEventListener('focus', onFocus)
    }

    return () => {
      disposed = true
      if (rafId) cancelAnimationFrame(rafId)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', onBlur)
        window.removeEventListener('focus', onFocus)
      }
    }
  }, [])

  return {
    isRunning: () => activeRef.current,
  }
}

export default useGameLoop
