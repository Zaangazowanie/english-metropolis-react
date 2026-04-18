import { useMemo, useState } from 'react'
import { useTheme } from '../../design-system/ThemeContext'
import { FONTS, EASE } from '../../design-system/tokens'
import { Eyebrow, Btn } from '../../design-system/primitives'

// Article / grammar drill — generates fill-in-the-gap prompts from the
// student's own keyErrors. When none exist, falls back to a static set
// so the surface never empties.

const STATIC_PROMPTS = [
  { prompt: 'I _____ patience for this kind of detail work.',    answer: 'have',  distractors: ['have the', 'am having the'], explain: 'Abstract noun, general statement → zero article.' },
  { prompt: 'She has _____ courage to disagree publicly.',       answer: 'the',   distractors: ['—', 'a'],                   explain: 'Specific reference (her demonstrated courage) → "the".' },
  { prompt: 'Entrepreneurship _____ a strange word in Polish.',  answer: 'is',    distractors: ['the is', 'it is the'],       explain: 'Abstract subject, no article needed.' },
  { prompt: "I admire _____ honesty — I just can't always match it.", answer: 'his', distractors: ['the his', 'his the'],   explain: 'Possessive replaces the article.' },
  { prompt: 'There is _____ silence in the room you could cut with a knife.', answer: 'a', distractors: ['the', '—'],        explain: 'Specific instance, countable use → indefinite article.' },
  { prompt: 'He has dedicated his life to _____ research on Polish dialects.', answer: '—', distractors: ['the', 'a'],        explain: '"Research" as an uncountable abstract field → zero article.' },
]

export default function Practice({ data }) {
  const { T } = useTheme()
  const { analyses = [] } = data || {}

  const prompts = useMemo(() => {
    const personalised = buildDrillsFromAnalyses(analyses).slice(0, 8)
    return personalised.length >= 3 ? personalised : STATIC_PROMPTS
  }, [analyses])

  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState(null)

  const q = prompts[step] || STATIC_PROMPTS[0]
  const allOpts = useMemo(
    () => [q.answer, ...(q.distractors || [])].sort(() => Math.random() - 0.5),
    [step, q.answer, q.distractors]
  )
  const correct = picked === q.answer

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh' }}>
      <div style={{ padding: '40px 56px 24px', borderBottom: `1px solid ${T.ruleSoft}` }}>
        <Eyebrow>Drill · Your patterns, one at a time</Eyebrow>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'end',
        }}>
          <h1 style={{
            fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
            fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95, letterSpacing: -2,
            margin: '8px 0 0', color: T.text,
          }}>
            {prompts.length} prompts. <span style={{ color: T.brand }}>Five minutes</span>.
          </h1>
          <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: T.brand }}>
            {String(step + 1).padStart(2, '0')} / {String(prompts.length).padStart(2, '0')}
          </div>
        </div>
        <div style={{ marginTop: 24, height: 2, background: T.ruleSoft }}>
          <div style={{
            height: '100%',
            width: `${((step + (picked ? 1 : 0)) / prompts.length) * 100}%`,
            background: T.brand, transition: `width 460ms ${EASE.editorial}`,
          }}/>
        </div>
      </div>

      <div style={{ padding: '80px 56px', maxWidth: 980, margin: '0 auto' }}>
        <div style={{
          fontFamily: FONTS.label, fontSize: 10, letterSpacing: '0.28em',
          color: T.textMute, textTransform: 'uppercase', marginBottom: 20,
        }}>Fill the gap</div>
        <div style={{
          fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
          fontSize: 'clamp(36px, 4.5vw, 60px)', lineHeight: 1.15,
          letterSpacing: -1, color: T.text,
        }}>
          {q.prompt.split('_____').map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && (
                <span style={{
                  display: 'inline-block', minWidth: 110,
                  padding: '0 16px', margin: '0 6px',
                  borderBottom: `2px solid ${picked
                    ? (correct ? T.brand : T.accent)
                    : T.brand}`,
                  color: picked ? (correct ? T.brand : T.accent) : T.brand,
                  fontStyle: 'normal',
                }}>{picked || ' '}</span>
              )}
            </span>
          ))}
        </div>

        <div style={{ marginTop: 56, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {allOpts.map(opt => {
            const isPicked = picked === opt
            const isAns = opt === q.answer
            const reveal = picked !== null
            const display = opt === '—' ? 'Ø (no article)' : opt
            return (
              <button key={opt} onClick={() => !picked && setPicked(opt)} disabled={!!picked}
                style={{
                  padding: '20px 32px', minWidth: 160,
                  background: reveal && isAns ? T.brand
                    : reveal && isPicked ? T.accent
                    : T.panel,
                  color: reveal && (isAns || isPicked) ? T.bg : T.text,
                  border: `1px solid ${reveal && isAns ? T.brand
                    : reveal && isPicked ? T.accent
                    : T.rule}`,
                  fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 22,
                  cursor: picked ? 'default' : 'pointer',
                  transition: `all 320ms ${EASE.springGentle}`,
                }}>{display}</button>
            )
          })}
        </div>

        {picked && (
          <div style={{
            marginTop: 48, padding: 28, background: T.panel,
            borderLeft: `2px solid ${correct ? T.brand : T.accent}`,
          }}>
            <Eyebrow color={correct ? T.brand : T.accent}>
              {correct ? 'A clean swing' : 'A whisker off'}
            </Eyebrow>
            <div style={{
              fontFamily: FONTS.body, fontSize: 16, lineHeight: 1.55,
              color: T.text, marginTop: 8,
            }}>{q.explain}</div>
            <div style={{ marginTop: 24 }}>
              <Btn kind="primary" onClick={() => {
                setPicked(null)
                setStep((step + 1) % prompts.length)
              }}>Next prompt →</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function buildDrillsFromAnalyses(analyses) {
  const prompts = []
  for (const a of analyses) {
    for (const e of (a.keyErrors || [])) {
      if (!e?.error || !e?.correction) continue
      if (prompts.length >= 12) break
      prompts.push({
        prompt: `You said: "${e.error}" → rewrite to correct form.`,
        answer: e.correction,
        distractors: [
          e.error,
          rewrap(e.correction),
        ].filter(Boolean),
        explain: `${e.category ? e.category[0].toUpperCase() + e.category.slice(1) : 'Language'} — the corrected shape: "${e.correction}".`,
      })
    }
  }
  return prompts
}

function rewrap(s) {
  // simple distractor transformation — reorder first two words
  const parts = String(s || '').trim().split(/\s+/)
  if (parts.length < 3) return null
  return [parts[1], parts[0], ...parts.slice(2)].join(' ')
}
