// QuestionRenderer — picks the right type-specific component, wraps it in a
// Glass card with prompt + feedback footer (explanation + optional PL hint).

import { useState } from 'react'
import { Glass } from '../../design/v3/primitives.jsx'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { FONT } from '../../design/v3/tokens.js'
import { useI18n } from '../../i18n'
import MCQ from './MCQ.jsx'
import GapFillBank from './GapFillBank.jsx'
import DropdownInline from './DropdownInline.jsx'
import MatchPairs from './MatchPairs.jsx'
import Reorder from './Reorder.jsx'
import Transform from './Transform.jsx'

const TYPE_META = {
  'mcq':              { label: 'Multiple choice',     icon: 'radio_button_checked' },
  'gap-fill-bank':    { label: 'Fill the gap',         icon: 'edit_note' },
  'dropdown-inline':  { label: 'Choose the form',      icon: 'expand_more' },
  'match-pairs':      { label: 'Match the pairs',      icon: 'compare_arrows' },
  'reorder':          { label: 'Build the sentence',   icon: 'low_priority' },
  'transform':        { label: 'Rewrite',              icon: 'swap_horiz' },
}

const RENDERERS = {
  'mcq': MCQ,
  'gap-fill-bank': GapFillBank,
  'dropdown-inline': DropdownInline,
  'match-pairs': MatchPairs,
  'reorder': Reorder,
  'transform': Transform,
}

const GAP_RX = /(_{2,}|\[\s*___\s*\]|\[\s*blank\s*\])/gi

export default function QuestionRenderer({ question, onAnswer, answered, userAnswer, correct, accent, sessionSalt }) {
  const { T } = useV3Theme()
  const { t, lang } = useI18n()
  const [hintOpen, setHintOpen] = useState(false)

  const type = question?.type || 'mcq'
  const meta = TYPE_META[type] || TYPE_META.mcq
  const Comp = RENDERERS[type] || MCQ
  const prompt = String(question?.prompt || '')

  // For dropdown-inline / gap-fill-bank the prompt itself contains the gap;
  // those renderers paint the prompt themselves. For MCQ / Transform / etc.
  // we render the prompt as a heading.
  const promptInline = type === 'gap-fill-bank' || type === 'dropdown-inline'

  return (
    <Glass padding={26}>
      <div style={{
        fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, color: accent.solid,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{meta.icon}</span>
        {meta.label}
      </div>

      {!promptInline && (
        <h2 style={{
          fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 500, fontStyle: 'italic',
          letterSpacing: '-0.015em', lineHeight: 1.35, margin: '0 0 22px', color: T.text,
        }}>
          {/_{2,}|\[\s*___\s*\]|\[\s*blank\s*\]/i.test(prompt)
            ? prompt.split(GAP_RX).map((chunk, i) => {
                GAP_RX.lastIndex = 0
                return /_{2,}|\[\s*___\s*\]|\[\s*blank\s*\]/i.test(chunk)
                  ? <span key={i} style={{ display: 'inline-block', minWidth: 100, height: 4, margin: '0 6px 6px', borderRadius: 4, background: accent.grad }}/>
                  : <span key={i}>{chunk}</span>
              })
            : prompt}
        </h2>
      )}

      <Comp
        question={question}
        onAnswer={onAnswer}
        answered={answered}
        userAnswer={userAnswer}
        correct={correct}
        accent={accent}
        sessionSalt={sessionSalt}
      />

      {/* PL hint — only for PL UI, only if a per-question pl_hint exists */}
      {lang === 'pl' && question?.pl_hint && !answered && (
        <button type="button" onClick={() => setHintOpen(o => !o)} style={{
          marginTop: 14, padding: '6px 12px', borderRadius: 999,
          background: 'transparent', color: T.textSoft, border: `1px dashed ${T.border}`,
          fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>lightbulb</span>
          {hintOpen ? 'Ukryj wskazówkę' : 'Pokaż wskazówkę po polsku'}
        </button>
      )}
      {lang === 'pl' && question?.pl_hint && hintOpen && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(217,70,239,0.08)', border: `1px solid rgba(217,70,239,0.25)`,
          fontSize: 13, color: T.textSoft, fontFamily: FONT.body,
        }}>{question.pl_hint}</div>
      )}

      {/* Feedback strip — explanation appears after answering */}
      {answered && question?.explanation && (
        <div style={{
          marginTop: 18, padding: '12px 16px', borderRadius: 12,
          background: correct ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
          border: `1px solid ${correct ? T.good : T.rose}`,
          fontSize: 13, color: T.text, lineHeight: 1.5,
        }}>
          <strong style={{ marginRight: 6 }}>{correct ? (t('quiz.question.correctBang') || 'Correct!') : (t('quiz.question.incorrect') || 'Not quite.')}</strong>
          {question.explanation}
        </div>
      )}
    </Glass>
  )
}

export { TYPE_META }
