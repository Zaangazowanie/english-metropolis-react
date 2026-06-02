// GapFillBank — sentence with one or more `___` gaps. Word bank below.
// Click a bank word -> goes into the next empty gap. Click a filled gap to clear.
// Library question shape:
//   { id, type: 'gap-fill-bank', prompt, bank: [string],
//     correctAnswers: [string]  // ordered, one per ___,
//     explanation?, pl_hint? }

import { useMemo, useState, useEffect } from 'react'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { FONT } from '../../design/v3/tokens.js'
import { seededShuffle, shuffleSeedFor } from './shuffle.js'

const GAP_RX = /(_{2,}|\[\s*___\s*\]|\[\s*blank\s*\])/gi

export default function GapFillBank({ question, onAnswer, answered, accent, sessionSalt }) {
  const { T } = useV3Theme()
  const prompt = String(question?.prompt || '')
  const correctAnswers = Array.isArray(question?.correctAnswers) ? question.correctAnswers : []
  const bank = useMemo(() => {
    const raw = Array.isArray(question?.bank) ? question.bank : correctAnswers.slice()
    return seededShuffle(raw, shuffleSeedFor(question, sessionSalt))
  }, [question, sessionSalt])

  const parts = prompt.split(GAP_RX)
  const gapCount = parts.filter(p => GAP_RX.test(p)).length || correctAnswers.length || 1
  // Reset GAP_RX lastIndex (split with /g doesn't but test() does).
  GAP_RX.lastIndex = 0

  const [filled, setFilled] = useState(() => Array(gapCount).fill(null))

  // Reset when the question changes.
  useEffect(() => { setFilled(Array(gapCount).fill(null)) }, [question?.id])

  const usedSet = new Set(filled.filter(Boolean))

  function pickFromBank(word) {
    if (answered) return
    const next = filled.slice()
    const empty = next.findIndex(x => x === null)
    if (empty === -1) return
    next[empty] = word
    setFilled(next)
    if (next.every(x => x !== null)) {
      const ok = next.every((w, i) => String(w).trim().toLowerCase() === String(correctAnswers[i] || '').trim().toLowerCase())
      onAnswer(next.join(' / '), ok)
    }
  }

  function clearGap(idx) {
    if (answered) return
    const next = filled.slice()
    next[idx] = null
    setFilled(next)
  }

  let gapIdx = 0
  return (
    <div>
      <div style={{ fontSize: 18, lineHeight: 1.7, color: T.text, marginBottom: 18 }}>
        {parts.map((chunk, i) => {
          if (GAP_RX.test(chunk)) {
            GAP_RX.lastIndex = 0
            const myIdx = gapIdx++
            const val = filled[myIdx]
            const isCorrectGap = answered && val && String(val).trim().toLowerCase() === String(correctAnswers[myIdx] || '').trim().toLowerCase()
            const isWrongGap = answered && val && !isCorrectGap
            return (
              <span key={i}
                onClick={() => clearGap(myIdx)}
                style={{
                  display: 'inline-block', minWidth: 80, padding: '4px 10px', margin: '0 4px',
                  borderRadius: 8, fontFamily: FONT.body, fontWeight: 600,
                  background: val ? (isCorrectGap ? 'rgba(52,211,153,0.15)' : isWrongGap ? 'rgba(251,113,133,0.15)' : accent.tint || 'rgba(217,70,239,0.10)') : 'transparent',
                  border: `2px ${val ? 'solid' : 'dashed'} ${val ? (isCorrectGap ? T.good : isWrongGap ? T.rose : accent.solid) : T.border}`,
                  cursor: !answered && val ? 'pointer' : 'default',
                  color: val ? T.text : T.textDim, textAlign: 'center',
                  minHeight: 28,
                }}
                title={!answered && val ? 'Click to clear' : ''}>
                {val || '   '}
              </span>
            )
          }
          GAP_RX.lastIndex = 0
          return <span key={i}>{chunk}</span>
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 14, borderRadius: 14, background: T.surface, border: `1px solid ${T.border}` }}>
        {bank.map((w, i) => {
          const used = usedSet.has(w)
          return (
            <button key={i} type="button" disabled={answered || used} onClick={() => pickFromBank(w)}
              style={{
                padding: '8px 14px', borderRadius: 999,
                background: used ? 'transparent' : (T.surfaceHi || 'rgba(255,255,255,0.06)'),
                color: used ? T.textMute : T.text, opacity: used ? 0.4 : 1,
                border: `1px solid ${used ? T.borderSoft : T.border}`,
                fontSize: 14, fontFamily: FONT.body, fontWeight: 600,
                cursor: answered || used ? 'default' : 'pointer',
                textDecoration: used ? 'line-through' : 'none',
              }}>{w}</button>
          )
        })}
      </div>
    </div>
  )
}
