import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../design-system/ThemeContext'
import { FONTS, EASE } from '../../design-system/tokens'
import { Eyebrow, Btn } from '../../design-system/primitives'

export default function Vocabulary({ data }) {
  const { T } = useTheme()
  const { profile, keywords = [], lessons = [] } = data || {}

  const allCards = useMemo(() => (keywords || []).map((k, i) => ({
    w: k.word || '',
    ipa: k.ipa ? (/^\//.test(k.ipa) ? k.ipa : `/${k.ipa}/`) : '',
    pl: k.translation || '',
    def: k.definitionEn || '',
    defPl: k.definitionPl || '',
    ex: k.exampleEn || '',
    exPl: k.examplePl || '',
    lesson: k.lessonNumber || 0,
    lessonTitle: k.lessonTitle || '',
    topic: k.lessonTopic || (k.topics || [])[0] || '',
    band: k.difficulty || k.cefrLevel || '',
    id: k.id || i,
  })), [keywords])

  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [lessonFilter, setLessonFilter] = useState('all')

  const cards = useMemo(() => {
    if (lessonFilter === 'all') return allCards
    const target = String(lessonFilter)
    return allCards.filter(c => String(c.lesson) === target)
  }, [allCards, lessonFilter])

  useEffect(() => { setIdx(0); setFlipped(false) }, [lessonFilter])

  const card = cards[idx] || null

  const next = () => {
    if (!cards.length) return
    setFlipped(false)
    setTimeout(() => setIdx((idx + 1) % cards.length), 200)
  }
  const prev = () => {
    if (!cards.length) return
    setFlipped(false)
    setTimeout(() => setIdx((idx - 1 + cards.length) % cards.length), 200)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === ' ') { e.preventDefault(); setFlipped(f => !f) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!allCards.length) {
    return (
      <div style={{ background: T.bg, color: T.text, minHeight: '100vh',
        padding: '64px 56px' }}>
        <Eyebrow>The Vocabulary · 0 entries</Eyebrow>
        <h1 style={{
          fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
          fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95,
          letterSpacing: -2, margin: '8px 0 24px', color: T.text,
        }}>
          A private corpus, <br/><span style={{ color: T.brand }}>read aloud</span>.
        </h1>
        <p style={{
          fontFamily: FONTS.body, fontSize: 16, lineHeight: 1.6,
          color: T.textMute, maxWidth: 560,
        }}>
          Your vocabulary fills lesson by lesson. Book a session with Michael and
          the first set of cards will appear here after your next transcript
          lands.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh' }}>
      <div style={{ padding: '40px 56px 24px', borderBottom: `1px solid ${T.ruleSoft}` }}>
        <Eyebrow>The Vocabulary · {allCards.length} entries</Eyebrow>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'end',
          gap: 24, flexWrap: 'wrap',
        }}>
          <h1 style={{
            fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
            fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95,
            letterSpacing: -2, margin: '8px 0 0', color: T.text, maxWidth: 800,
          }}>
            A private corpus, <br/><span style={{ color: T.brand }}>read aloud</span>.
          </h1>
          <div style={{
            display: 'flex', gap: 24, alignItems: 'center',
            fontFamily: FONTS.label, fontSize: 10, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: T.textMute,
          }}>
            <label>
              <select value={lessonFilter} onChange={e => setLessonFilter(e.target.value)}
                style={{
                  padding: '6px 10px', background: 'transparent',
                  border: `1px solid ${T.ruleSoft}`,
                  color: T.text, fontFamily: FONTS.label, fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                }}>
                <option value="all">All lessons</option>
                {lessons.map(l => (
                  <option key={l.id} value={l.lessonNumber}>
                    L{String(l.lessonNumber).padStart(2, '0')} · {(l.title || '').slice(0, 30)}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ color: T.brand }}>● Card {cards.length ? idx + 1 : 0} of {cards.length}</span>
          </div>
        </div>
      </div>

      <div style={{
        padding: '64px 56px',
        display: 'grid', gridTemplateColumns: '1fr 360px',
        gap: 56, alignItems: 'start',
      }}>
        {/* Card */}
        <div>
          <div style={{ perspective: 2000, height: 480 }}>
            <div onClick={() => setFlipped(f => !f)}
              style={{
                position: 'relative', width: '100%', height: '100%',
                transformStyle: 'preserve-3d', cursor: 'pointer',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)',
                transition: `transform 720ms ${EASE.editorial}`,
              }}>
              {/* RECTO */}
              <div style={{
                position: 'absolute', inset: 0,
                background: T.panel, border: `1px solid ${T.rule}`,
                padding: '64px 72px', backfaceVisibility: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: FONTS.mono, fontSize: 10, color: T.textMute, letterSpacing: 1,
                }}>
                  <span>RECTO · L{String(card?.lesson || 0).padStart(2, '0')} · {truncate(card?.topic, 24)}</span>
                  <span>{card?.band || ''}</span>
                </div>
                <div>
                  <div style={{
                    fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
                    fontSize: 96, lineHeight: 1, letterSpacing: -3, color: T.text,
                    marginBottom: 18,
                  }}>{card?.w || '—'}</div>
                  {card?.ipa && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 18, color: T.brand }}>
                        {card.ipa}
                      </span>
                      <button style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: T.brand, color: T.bg, border: 'none',
                        fontSize: 14, cursor: 'pointer',
                      }} aria-label="Hear it">♪</button>
                    </div>
                  )}
                </div>
                <div style={{
                  fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.28em',
                  textTransform: 'uppercase', color: T.textMute, textAlign: 'right',
                }}>Tap to turn the page →</div>
              </div>
              {/* VERSO */}
              <div style={{
                position: 'absolute', inset: 0,
                background: T.panelLift, border: `1px solid ${T.rule}`,
                padding: '56px 72px', backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                display: 'flex', flexDirection: 'column', gap: 24,
                overflow: 'hidden',
              }}>
                <div style={{
                  fontFamily: FONTS.mono, fontSize: 10, color: T.textMute, letterSpacing: 1,
                }}>VERSO · DEFINITION + USE</div>
                {card?.pl && (
                  <div>
                    <div style={{
                      fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.28em',
                      textTransform: 'uppercase', color: T.brand, marginBottom: 10,
                    }}>Polski</div>
                    <div style={{
                      fontFamily: FONTS.serif, fontStyle: 'italic',
                      fontSize: 22, lineHeight: 1.25, color: T.text,
                    }}>{card.pl}</div>
                  </div>
                )}
                {card?.def && (
                  <>
                    <div style={{ height: 1, background: T.ruleSoft }}/>
                    <div>
                      <div style={{
                        fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.28em',
                        textTransform: 'uppercase', color: T.textMute, marginBottom: 8,
                      }}>English</div>
                      <div style={{
                        fontFamily: FONTS.body, fontSize: 15, lineHeight: 1.55,
                        color: T.textSoft,
                      }}>{card.def}</div>
                    </div>
                  </>
                )}
                {card?.ex && (
                  <div style={{
                    marginTop: 'auto', padding: 16,
                    borderLeft: `2px solid ${T.brand}`,
                  }}>
                    <div style={{
                      fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.28em',
                      color: T.brand, textTransform: 'uppercase', marginBottom: 6,
                    }}>Heard in lesson</div>
                    <div style={{
                      fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 16,
                      color: T.text,
                    }}>&ldquo;{card.ex}&rdquo;</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{
            marginTop: 32, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <Btn kind="ghost" onClick={prev} disabled={!cards.length}>← Previous</Btn>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn kind="danger" size="sm">Need work</Btn>
              <Btn kind="ghost" size="sm">Almost</Btn>
              <Btn kind="primary" size="sm" onClick={next} disabled={!cards.length}>I know this →</Btn>
            </div>
          </div>
        </div>

        {/* Side index */}
        <div>
          <Eyebrow>Up next</Eyebrow>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {cards.slice(0, 30).map((c, i) => (
              <button key={c.id} onClick={() => { setFlipped(false); setIdx(i) }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '14px 0', background: 'none', border: 'none',
                  borderBottom: `1px solid ${T.ruleHair}`,
                  cursor: 'pointer',
                  display: 'grid', gridTemplateColumns: '32px 1fr auto',
                  gap: 12, alignItems: 'baseline',
                }}>
                <span style={{
                  fontFamily: FONTS.mono, fontSize: 10,
                  color: i === idx ? T.brand : T.textMute,
                }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{
                  fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 17,
                  color: i === idx ? T.brand : T.text,
                }}>{c.w}</span>
                {c.band && (
                  <span style={{
                    fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.18em',
                    color: T.textMute, textTransform: 'uppercase',
                  }}>{c.band}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function truncate(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
