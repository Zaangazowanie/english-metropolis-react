// MCQ — 4-option multiple choice, click-only, answer position randomised.
// Library question shape:
//   { id, type: 'mcq', prompt, options: [string], correctAnswer: string,
//     explanation?: string, pl_hint?: string }

import { useMemo } from 'react'
import { Glass } from '../../design/v3/primitives.jsx'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { FONT } from '../../design/v3/tokens.js'
import { seededShuffle, shuffleSeedFor } from './shuffle.js'

export default function MCQ({ question, onAnswer, answered, userAnswer, accent, sessionSalt }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const correct = String(question?.correctAnswer || '').trim()
  const opts = Array.isArray(question?.options) ? question.options : []

  const shuffled = useMemo(
    () => seededShuffle(opts, shuffleSeedFor(question, sessionSalt)),
    [question, sessionSalt],
  )

  function pick(opt) {
    if (answered) return
    const ok = String(opt).trim().toLowerCase() === correct.toLowerCase()
    onAnswer(opt, ok)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {shuffled.map((opt, i) => {
        const isSelected = userAnswer === opt
        const isCorrect = answered && String(opt).trim().toLowerCase() === correct.toLowerCase()
        const isWrong = answered && isSelected && !isCorrect
        let bg = isDay ? '#fff' : 'rgba(255,255,255,0.04)'
        let border = T.border, color = T.text
        let badgeBg = isDay ? '#F3EEFE' : 'rgba(255,255,255,0.06)', badgeColor = T.textDim
        if (answered) {
          if (isCorrect)    { bg = isDay ? '#F0FDF4' : 'rgba(52,211,153,0.12)'; border = T.good; badgeBg = T.good; badgeColor = '#fff' }
          else if (isWrong) { bg = isDay ? '#FEF2F2' : 'rgba(251,113,133,0.12)'; border = T.rose; badgeBg = T.rose; badgeColor = '#fff' }
          else              { bg = isDay ? '#FAFAFB' : 'rgba(255,255,255,0.02)'; color = T.textDim }
        }
        return (
          <button key={i} type="button" disabled={answered} onClick={() => pick(opt)}
            onMouseEnter={e => { if (!answered) e.currentTarget.style.borderColor = accent.solid }}
            onMouseLeave={e => { if (!answered) e.currentTarget.style.borderColor = T.border }}
            style={{
              padding: '14px 18px', borderRadius: 14, background: bg, color,
              border: `1.5px solid ${border}`, cursor: answered ? 'default' : 'pointer',
              fontSize: 15, fontFamily: FONT.body, textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 14, transition: 'all 160ms',
            }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, background: badgeBg, color: badgeColor,
              fontFamily: FONT.mono, fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{String.fromCharCode(65 + i)}</span>
            <span style={{ flex: 1 }}>{opt}</span>
            {answered && isCorrect && <span className="material-symbols-outlined" style={{ color: T.good }}>check_circle</span>}
            {answered && isWrong && <span className="material-symbols-outlined" style={{ color: T.rose }}>cancel</span>}
          </button>
        )
      })}
    </div>
  )
}
