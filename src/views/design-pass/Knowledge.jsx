import { useMemo, useState } from 'react'
import { useTheme } from '../../design-system/ThemeContext'
import { FONTS, EASE } from '../../design-system/tokens'
import { Eyebrow, Pill, Btn } from '../../design-system/primitives'

// Knowledge base — aggregates keyErrors across all analyses into a pattern
// library grouped by category. Wire-ready for a dedicated errorPatterns
// Convex table later if/when Mike builds one.

const CATEGORIES = ['All', 'Grammar', 'Vocabulary', 'Pronunciation', 'Articles', 'Tense', 'Modals', 'Prepositions', 'Discourse']

export default function Knowledge({ data }) {
  const { T } = useTheme()
  const { analyses = [] } = data || {}
  const [category, setCategory] = useState('All')
  const [openId, setOpenId] = useState(null)

  const patterns = useMemo(() => aggregatePatterns(analyses), [analyses])
  const visible = useMemo(() => (
    category === 'All' ? patterns : patterns.filter(p =>
      (p.cat || '').toLowerCase().includes(category.toLowerCase()))
  ), [patterns, category])

  if (!patterns.length) {
    return (
      <div style={{
        background: T.bg, color: T.text, minHeight: '100vh',
        padding: '64px 56px',
      }}>
        <Eyebrow>The Knowledge · 0 patterns</Eyebrow>
        <h1 style={{
          fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
          fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95, letterSpacing: -2,
          margin: '8px 0 24px',
        }}>
          Your patterns, <span style={{ color: T.brand }}>charted</span>.
        </h1>
        <p style={{
          fontFamily: FONTS.body, fontSize: 16, lineHeight: 1.6,
          color: T.textMute, maxWidth: 560,
        }}>
          Patterns only appear once they surface twice. Keep booking lessons — the
          things you say wrong reliably will collect here, each with the Polish
          reason why and the smallest thing that fixes it.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh' }}>
      <div style={{ padding: '40px 56px 24px', borderBottom: `1px solid ${T.ruleSoft}` }}>
        <Eyebrow>The Knowledge · {patterns.length} patterns</Eyebrow>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'end',
          gap: 32, flexWrap: 'wrap',
        }}>
          <h1 style={{
            fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
            fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95,
            letterSpacing: -2, margin: '8px 0 0', color: T.text, maxWidth: 900,
          }}>
            Your patterns, <span style={{ color: T.brand }}>charted</span>.
          </h1>
          <div style={{
            fontFamily: FONTS.body, fontStyle: 'italic',
            fontSize: 14, color: T.textMute, maxWidth: 360, textAlign: 'right',
          }}>
            The things you say wrong reliably — with the Polish reason, the English
            rule, and the smallest thing that fixes each one.
          </div>
        </div>
      </div>

      <div style={{ padding: 56 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 32 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              style={{
                padding: '6px 14px',
                background: category === c ? T.brand : 'transparent',
                color: category === c ? T.bg : T.text,
                border: `1px solid ${category === c ? T.brand : T.ruleSoft}`,
                fontFamily: FONTS.label, fontSize: 10, fontWeight: 600,
                letterSpacing: '0.22em', textTransform: 'uppercase',
                cursor: 'pointer', transition: `background 180ms ${EASE.springFast}`,
              }}>{c}</button>
          ))}
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 1,
          background: T.ruleSoft, border: `1px solid ${T.ruleSoft}`,
        }}>
          {visible.map((p, idx) => {
            const open = openId === p.id
            return (
              <div key={p.id} style={{ background: T.bg }}>
                <button onClick={() => setOpenId(open ? null : p.id)}
                  style={{
                    width: '100%', padding: '24px 32px',
                    background: open ? T.panel : T.bg, border: 'none', textAlign: 'left',
                    display: 'grid', gridTemplateColumns: '60px 1fr 200px 80px 24px',
                    gap: 24, alignItems: 'center', cursor: 'pointer',
                    transition: `background 220ms ${EASE.springFast}`,
                  }}>
                  <span style={{
                    fontFamily: FONTS.mono, fontSize: 10,
                    color: T.textMute, letterSpacing: 1,
                  }}>P·{String(idx + 1).padStart(2, '0')}</span>
                  <span style={{
                    fontFamily: FONTS.serif, fontStyle: 'italic',
                    fontSize: open ? 24 : 20,
                    color: open ? T.brand : T.text,
                    transition: `font-size 320ms ${EASE.springGentle}, color 220ms`,
                  }}>{p.title}</span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <Pill kind="ghost">{p.cat}</Pill>
                    {p.frequency === 'high' && <Pill color={T.accent} kind="outline">Frequent</Pill>}
                  </span>
                  <span style={{
                    fontFamily: FONTS.serif, fontStyle: 'italic',
                    fontSize: 24, color: T.brand, textAlign: 'right',
                  }}>
                    {p.count}
                    <span style={{
                      fontFamily: FONTS.label, fontSize: 9, letterSpacing: 1,
                      color: T.textMute, marginLeft: 4,
                    }}>×</span>
                  </span>
                  <span style={{
                    fontFamily: FONTS.serif, fontSize: 22, color: T.brand, textAlign: 'right',
                    transform: open ? 'rotate(45deg)' : 'rotate(0)',
                    transition: `transform 320ms ${EASE.springGentle}`,
                  }}>+</span>
                </button>

                {open && (
                  <div style={{
                    padding: '0 32px 36px', background: T.panel,
                  }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40,
                      paddingTop: 8,
                    }}>
                      <div>
                        <Eyebrow color={T.accent}>What you said</Eyebrow>
                        {p.examples.slice(0, 3).map((ex, i) => (
                          <div key={i} style={{
                            padding: 18, borderLeft: `2px solid ${T.accent}`,
                            fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 18,
                            color: T.text, marginBottom: 14,
                          }}>&ldquo;{ex.said}&rdquo;</div>
                        ))}
                        <Eyebrow color={T.brand}>What works</Eyebrow>
                        {p.examples.slice(0, 3).map((ex, i) => (
                          <div key={i} style={{
                            padding: 18, borderLeft: `2px solid ${T.brand}`,
                            fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 18,
                            color: T.text, marginBottom: 14,
                          }}>&ldquo;{ex.works}&rdquo;</div>
                        ))}
                      </div>
                      <div>
                        <Eyebrow>Heard in</Eyebrow>
                        <div style={{
                          fontFamily: FONTS.body, fontSize: 14, lineHeight: 1.6,
                          color: T.textSoft, marginBottom: 24,
                        }}>
                          {p.lessons.slice(0, 5).map((l, i) => (
                            <span key={i}>
                              {i > 0 && ' · '}
                              <span style={{ color: T.text }}>L{l.n}</span>{' '}
                              <span style={{ fontStyle: 'italic', color: T.textMute }}>{l.date}</span>
                            </span>
                          ))}
                        </div>
                        <Eyebrow color={T.brand}>The category</Eyebrow>
                        <div style={{
                          fontFamily: FONTS.body, fontSize: 14, lineHeight: 1.65,
                          color: T.text, marginBottom: 24,
                        }}>
                          {categoryBlurb(p.cat)}
                        </div>
                        <div style={{
                          padding: 16, background: T.bg,
                          border: `1px solid ${T.brand}40`,
                        }}>
                          <div style={{
                            fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.28em',
                            color: T.brand, textTransform: 'uppercase', marginBottom: 6,
                          }}>The smallest fix</div>
                          <div style={{
                            fontFamily: FONTS.body, fontSize: 14, lineHeight: 1.55,
                            color: T.text,
                          }}>
                            For each occurrence, pause at the same place in the sentence
                            and deliver the correction above aloud. Three conscious
                            deliveries usually unsticks the pattern.
                          </div>
                        </div>
                        <div style={{ marginTop: 18 }}>
                          <Btn kind="outline" size="sm">Drill this pattern →</Btn>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Aggregate keyErrors across all analyses into patterns grouped by
// (category, error-prefix) tuple.
function aggregatePatterns(analyses) {
  const buckets = new Map()
  for (const a of analyses) {
    const errors = a.keyErrors || []
    for (const e of errors) {
      if (!e?.error) continue
      const cat = formatCat(e.category || 'Language')
      const id = `${cat}-${(e.error || '').slice(0, 24).toLowerCase().replace(/\W+/g, '-')}`
      if (!buckets.has(id)) {
        buckets.set(id, {
          id, cat,
          title: shortenTitle(e.error, e.correction, cat),
          examples: [],
          lessons: [],
          count: 0,
        })
      }
      const b = buckets.get(id)
      b.count += 1
      b.examples.push({
        said: e.error,
        works: e.correction || '—',
      })
      if (a.lessonNumber || a.lessonTitle) {
        b.lessons.push({
          n: a.lessonNumber || '?',
          date: formatDate(a.date) || '',
        })
      }
    }
  }
  const list = [...buckets.values()].sort((a, b) => b.count - a.count)
  for (const p of list) {
    p.frequency = p.count >= 3 ? 'high' : p.count === 2 ? 'medium' : 'low'
  }
  return list
}

function formatCat(c) {
  const s = String(c || '').trim()
  const map = {
    grammar: 'Grammar',
    vocab: 'Vocabulary', vocabulary: 'Vocabulary',
    pron: 'Pronunciation', pronunciation: 'Pronunciation',
    article: 'Articles', articles: 'Articles',
    tense: 'Tense',
    modal: 'Modals', modals: 'Modals',
    prep: 'Prepositions', prepositions: 'Prepositions',
    discourse: 'Discourse',
  }
  return map[s.toLowerCase()] || (s[0] ? s[0].toUpperCase() + s.slice(1).toLowerCase() : 'Language')
}

function shortenTitle(error, correction, cat) {
  const e = String(error || '').slice(0, 48).replace(/\s+/g, ' ').trim()
  if (!e) return `${cat} pattern`
  return `${cat} · ${e}${(error || '').length > 48 ? '…' : ''}`
}

function categoryBlurb(cat) {
  const map = {
    Grammar: 'Structural choices — tense, aspect, word order, auxiliaries. Polish speakers carry over aspect habits and free word order into English.',
    Vocabulary: 'Lexical precision — false friends, collocation, register. Polish-English cognates are unreliable friends; trust the example, not the spelling.',
    Pronunciation: 'Segmental and suprasegmental choices. Polish has no /θ/, /ð/, /w/~/v/ can drift; vowel length rarely marks meaning.',
    Articles: 'Polish has no article system. Definiteness in English is a separate channel — zero, a/an, the.',
    Tense: 'Polish leans on aspect (perfective vs imperfective). English cuts time into past/present/future × simple/perfect/continuous — different mental map.',
    Modals: 'English modals carry nuance Polish marks differently. Would, could, might, should all have register and temporal shades.',
    Prepositions: 'Small words with big consequences. Most preposition errors are lexical memory, not rule failure.',
    Discourse: 'Connection between sentences — cohesion devices, back-reference, given-new structure. Polish spoken register is looser than English academic.',
  }
  return map[cat] || 'The grammatical or lexical territory where Polish and English diverge.'
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return String(d).slice(0, 10)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
