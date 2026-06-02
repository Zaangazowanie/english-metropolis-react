// DropdownInline — sentence with one inline <select>. Zero typing.
// Library question shape:
//   { id, type: 'dropdown-inline', prompt,
//     options: [string], correctAnswer: string,
//     explanation?, pl_hint? }

import { useMemo, useState, useEffect } from 'react'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { FONT } from '../../design/v3/tokens.js'
import { seededShuffle, shuffleSeedFor } from './shuffle.js'

const GAP_RX = /(_{2,}|\[\s*___\s*\]|\[\s*blank\s*\])/gi

export default function DropdownInline({ question, onAnswer, answered, accent, sessionSalt }) {
  const { T, mode } = useV3Theme()
  const prompt = String(question?.prompt || '')
  const correct = String(question?.correctAnswer || '').trim()
  const options = useMemo(
    () => seededShuffle(Array.isArray(question?.options) ? question.options : [], shuffleSeedFor(question, sessionSalt)),
    [question, sessionSalt],
  )
  const [val, setVal] = useState('')

  useEffect(() => { setVal('') }, [question?.id])

  function commit(v) {
    if (answered) return
    setVal(v)
    if (v) {
      const ok = String(v).trim().toLowerCase() === correct.toLowerCase()
      onAnswer(v, ok)
    }
  }

  const parts = prompt.split(GAP_RX)
  GAP_RX.lastIndex = 0
  const isCorrect = answered && val && String(val).trim().toLowerCase() === correct.toLowerCase()

  return (
    <div style={{ fontSize: 18, lineHeight: 1.7, color: T.text }}>
      {parts.map((chunk, i) => {
        if (GAP_RX.test(chunk)) {
          GAP_RX.lastIndex = 0
          return (
            <select key={i} value={val} onChange={e => commit(e.target.value)} disabled={answered}
              style={{
                margin: '0 6px', padding: '8px 14px', borderRadius: 10,
                fontSize: 16, fontFamily: FONT.body, fontWeight: 600,
                background: mode === 'day' ? '#fff' : 'rgba(255,255,255,0.06)',
                color: T.text,
                border: `2px solid ${answered ? (isCorrect ? T.good : T.rose) : (val ? accent.solid : T.border)}`,
                cursor: answered ? 'default' : 'pointer',
              }}>
              <option value="">— choose —</option>
              {options.map((o, j) => <option key={j} value={o}>{o}</option>)}
            </select>
          )
        }
        GAP_RX.lastIndex = 0
        return <span key={i}>{chunk}</span>
      })}
    </div>
  )
}
