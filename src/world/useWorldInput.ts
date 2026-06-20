// useWorldInput — hand-rolled player input (no physics/input deps).
//
// Exposes two refs that the in-canvas rig reads each frame:
//   • keysRef — the set of currently-pressed movement keys (WASD + arrows).
//   • joyRef  — the touch joystick vector { x, y } in [-1, 1], or null when
//               no touch is active. The TouchJoystick DOM overlay writes here.
//
// The rig computes the effective move vector from joyRef (if active) else
// keysRef, so keyboard and touch never fight and neither re-renders React.
//
// y = +1 means "forward / up", matching screen-up and W / ArrowUp.

import { useEffect, useRef } from 'react'

export interface JoyVec { x: number; y: number }

const MOVE_KEYS = new Set([
  'w', 'a', 's', 'd',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
])

export function useWorldInput(enabled: boolean) {
  const keysRef = useRef<Set<string>>(new Set())
  const joyRef = useRef<JoyVec | null>(null)

  useEffect(() => {
    if (!enabled) {
      keysRef.current.clear()
      return
    }
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (MOVE_KEYS.has(k)) {
        keysRef.current.add(k)
        // Prevent the page scrolling on arrow keys while playing.
        if (k.startsWith('arrow')) e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }
    // Dropping focus (tab-away) must release all keys, else Wren "runs away".
    const blur = () => keysRef.current.clear()

    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keysRef.current.clear()
    }
  }, [enabled])

  return { keysRef, joyRef }
}

/** Resolve the current keyboard state into an (x, y) vector in [-1, 1]. */
export function readKeys(keys: Set<string>): JoyVec {
  let x = 0
  let y = 0
  if (keys.has('a') || keys.has('arrowleft')) x -= 1
  if (keys.has('d') || keys.has('arrowright')) x += 1
  if (keys.has('w') || keys.has('arrowup')) y += 1
  if (keys.has('s') || keys.has('arrowdown')) y -= 1
  return { x, y }
}
