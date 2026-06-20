// useLampProgress — persist completed portal shellKeys to localStorage.
//
// Canon: completing an errand "relights" a lamp. The world remembers which
// lamps are lit across sessions. Per-device only (no Convex — frontend-only;
// a signed-in Convex sync lane is a future piece).
//
// Storage key: 'em-lamp-progress'
// Format: JSON array of shellKey strings, e.g. ["labelleddiagram","matching"]
//
// CONTRACT: no new deps; pure TS; no import from three/r3f. Safe to call
// during SSR (localStorage access is guarded by a try/catch).

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'em-lamp-progress'

function load(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function persist(set: Set<string>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
    }
  } catch { /* storage quota exceeded or private mode — silent */ }
}

export interface LampProgress {
  /** Set of shellKeys whose errands have been completed. */
  completed: Set<string>
  /** Mark an errand complete (idempotent). Persists immediately. */
  markComplete: (shellKey: string) => void
  /** Clear all progress (dev/test helper). */
  reset: () => void
}

export function useLampProgress(): LampProgress {
  const [completed, setCompleted] = useState<Set<string>>(load)

  const markComplete = useCallback((shellKey: string) => {
    setCompleted((prev) => {
      if (prev.has(shellKey)) return prev   // idempotent
      const next = new Set(prev)
      next.add(shellKey)
      persist(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setCompleted(new Set())
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch { /* noop */ }
  }, [])

  return { completed, markComplete, reset }
}
