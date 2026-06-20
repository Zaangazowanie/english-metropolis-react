// useDialogue — drives a visual-novel line sequence with a typewriter reveal.
//
// Presentation lives in DialogueBox; this hook owns the cursor + reveal state.
// reducedMotion → text appears instantly (no typewriter). advance() reveals the
// rest of the current line if still typing, else moves to the next line, else
// calls onComplete. The typewriter runs on a DOM timer (not the r3f render
// loop), so it never touches per-frame 3D allocations.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DialogueLine } from './dialogue'

const CHAR_MS = 22  // typewriter cadence

export interface DialogueApi {
  line: DialogueLine | null   // current line (null when inactive/finished)
  shownText: string           // revealed-so-far substring
  isTyping: boolean           // true while the typewriter is still revealing
  index: number               // current line index (0-based)
  total: number               // line count
  advance: () => void         // reveal-all → next line → onComplete
}

export function useDialogue(
  lines: DialogueLine[] | null,
  opts: { reducedMotion?: boolean; onComplete?: () => void },
): DialogueApi {
  const { reducedMotion = false, onComplete } = opts
  const [index, setIndex] = useState(0)
  const [shownText, setShownText] = useState('')
  const charRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const active = !!lines && lines.length > 0
  const line = active && index < lines!.length ? lines![index] : null
  const full = line ? line.text : ''

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  // Reset the cursor whenever the script identity changes (new dialogue opened).
  useEffect(() => {
    setIndex(0)
    charRef.current = 0
    setShownText('')
    return clearTimer
  }, [lines])

  // Typewriter for the current line.
  useEffect(() => {
    clearTimer()
    if (!line) { setShownText(''); return }
    if (reducedMotion) { charRef.current = full.length; setShownText(full); return }
    charRef.current = 0
    setShownText('')
    timerRef.current = setInterval(() => {
      charRef.current += 1
      setShownText(full.slice(0, charRef.current))
      if (charRef.current >= full.length) clearTimer()
    }, CHAR_MS)
    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, full, reducedMotion, line === null])

  const isTyping = !!line && shownText.length < full.length

  const advance = useCallback(() => {
    if (!line) return
    if (shownText.length < full.length) {
      // Reveal the rest of the current line immediately.
      clearTimer()
      charRef.current = full.length
      setShownText(full)
      return
    }
    if (lines && index < lines.length - 1) {
      setIndex((i) => i + 1)
    } else {
      onComplete?.()
    }
  }, [line, shownText, full, lines, index, onComplete])

  return { line, shownText, isTyping, index, total: lines ? lines.length : 0, advance }
}
