// Reorder — jumbled words. Click each word in order; build the sentence.
// Library question shape:
//   { id, type: 'reorder',
//     words: [string],            // jumbled (or natural — we always shuffle)
//     correctOrder: [string],     // canonical sentence as array
//     explanation?, pl_hint? }

import { useMemo, useState, useEffect } from 'react'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { FONT } from '../../design/v3/tokens.js'
import { seededShuffle, shuffleSeedFor } from './shuffle.js'

export default function Reorder({ question, onAnswer, answered, accent, sessionSalt }) {
  const { T } = useV3Theme()
  const correctOrder = Array.isArray(question?.correctOrder) ? question.correctOrder : []
  const seed = shuffleSeedFor(question, sessionSalt)

  // Tokenize bank words with stable indexes so duplicates ("the", "the") don't collide.
  const bankItems = useMemo(() => {
    const raw = Array.isArray(question?.words) ? question.words : correctOrder
    const tagged = raw.map((w, i) => ({ id: `w${i}`, text: w }))
    return seededShuffle(tagged, seed)
  }, [question, sessionSalt])

  const [picked, setPicked] = useState([])  // array of bank ids in order

  useEffect(() => { setPicked([]) }, [question?.id])

  const pickedSet = new Set(picked)

  function pick(item) {
    if (answered) return
    if (pickedSet.has(item.id)) return
    const next = [...picked, item.id]
    setPicked(next)
    if (next.length === bankItems.length) {
      const sentence = next.map(id => bankItems.find(b => b.id === id)?.text || '').join(' ')
      const target = correctOrder.join(' ')
      const ok = sentence.trim().toLowerCase().replace(/\s+/g, ' ') === target.trim().toLowerCase().replace(/\s+/g, ' ')
      onAnswer(sentence, ok)
    }
  }

  function undo() {
    if (answered) return
    setPicked(picked.slice(0, -1))
  }

  const builtSentence = picked.map(id => bankItems.find(b => b.id === id)?.text || '').join(' ')
  const isCorrect = answered && builtSentence.trim().toLowerCase().replace(/\s+/g, ' ') === correctOrder.join(' ').trim().toLowerCase().replace(/\s+/g, ' ')

  return (
    <div>
      <div style={{
        minHeight: 56, padding: '14px 16px', borderRadius: 14,
        background: T.surface,
        border: `2px solid ${answered ? (isCorrect ? T.good : T.rose) : T.border}`,
        marginBottom: 16, fontSize: 17, fontFamily: FONT.body, color: T.text, lineHeight: 1.6,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{ flex: 1 }}>{builtSentence || <em style={{ color: T.textDim }}>Click words below to build the sentence…</em>}</span>
        {!answered && picked.length > 0 && (
          <button type="button" onClick={undo} style={{
            padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`, cursor: 'pointer',
          }}>Undo</button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {bankItems.map(item => {
          const used = pickedSet.has(item.id)
          return (
            <button key={item.id} type="button" disabled={answered || used} onClick={() => pick(item)}
              style={{
                padding: '10px 16px', borderRadius: 999,
                background: used ? 'transparent' : (T.surfaceHi || 'rgba(255,255,255,0.06)'),
                color: used ? T.textMute : T.text, opacity: used ? 0.35 : 1,
                border: `1.5px solid ${used ? T.borderSoft : T.border}`,
                fontSize: 14, fontFamily: FONT.body, fontWeight: 600,
                cursor: answered || used ? 'default' : 'pointer',
              }}>{item.text}</button>
          )
        })}
      </div>
    </div>
  )
}
