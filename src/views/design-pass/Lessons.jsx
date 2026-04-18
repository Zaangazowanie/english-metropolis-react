import { Fragment, useMemo, useState } from 'react'
import { useTheme } from '../../design-system/ThemeContext'
import { FONTS } from '../../design-system/tokens'
import { Eyebrow, Pill, NumberTheatre } from '../../design-system/primitives'

export default function Lessons({ data }) {
  const { T } = useTheme()
  const { profile, lessons = [], analyses = [], averageScore = 0 } = data || {}
  const [selectedId, setSelectedId] = useState(lessons[0]?.id || null)

  const selected = useMemo(
    () => lessons.find(l => l.id === selectedId) || lessons[0] || null,
    [selectedId, lessons],
  )
  const selectedAnalysis = useMemo(() => {
    if (!selected) return null
    return analyses.find(a =>
      a.lessonId === selected.id ||
      (a.date && a.date === selected.date)
    ) || null
  }, [selected, analyses])

  if (!lessons.length) {
    return (
      <div style={{
        background: T.bg, color: T.text, minHeight: '100vh',
        padding: '64px 56px',
      }}>
        <Eyebrow>The Archive · 0 editions</Eyebrow>
        <h1 style={{
          fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
          fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95, letterSpacing: -2,
          margin: '8px 0 24px',
        }}>
          Every lesson, <span style={{ color: T.brand }}>kept</span>.
        </h1>
        <p style={{
          fontFamily: FONTS.body, fontSize: 16, lineHeight: 1.6,
          color: T.textMute, maxWidth: 560,
        }}>
          Your archive opens with lesson one. Book a session with Michael and the
          first edition will appear here after the transcript is processed.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh' }}>
      <div style={{ padding: '40px 56px 24px', borderBottom: `1px solid ${T.ruleSoft}` }}>
        <Eyebrow>The Archive · {lessons.length} editions</Eyebrow>
        <h1 style={{
          fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
          fontSize: 'clamp(40px, 5vw, 76px)', lineHeight: 0.95, letterSpacing: -2,
          margin: '8px 0 0', color: T.text, maxWidth: 800,
        }}>
          Every lesson, <span style={{ color: T.brand }}>kept</span>.
        </h1>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '420px 1fr',
        minHeight: 'calc(100vh - 200px)',
      }}>
        {/* Index */}
        <div style={{ borderRight: `1px solid ${T.ruleSoft}`, overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
          {lessons.map(l => {
            const isSel = l.id === selected?.id
            const analysis = analyses.find(a => a.lessonId === l.id || a.date === l.date)
            const score = Number(analysis?.overallScore || 0)
            return (
              <button key={l.id} onClick={() => setSelectedId(l.id)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '20px 32px', background: isSel ? T.panel : 'transparent',
                  border: 'none', borderBottom: `1px solid ${T.ruleHair}`,
                  borderLeft: isSel ? `2px solid ${T.brand}` : '2px solid transparent',
                  cursor: 'pointer',
                }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: FONTS.mono, fontSize: 10, color: T.textMute,
                  marginBottom: 6, letterSpacing: 1,
                }}>
                  <span>L·{String(l.lessonNumber || 0).padStart(2, '0')}</span>
                  <span>{formatDate(l.date)}</span>
                </div>
                <div style={{
                  fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 17,
                  color: isSel ? T.brand : T.text, lineHeight: 1.25,
                }}>{truncate(l.title || 'Untitled lesson', 80)}</div>
                <div style={{
                  marginTop: 10, display: 'flex', gap: 12, alignItems: 'baseline',
                }}>
                  {score > 0 ? (
                    <span style={{ fontFamily: FONTS.serif, fontSize: 22, color: T.brand }}>{score}</span>
                  ) : (
                    <span style={{ fontFamily: FONTS.serif, fontSize: 22, color: T.textFade }}>—</span>
                  )}
                  <span style={{
                    fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.18em',
                    color: T.textMute, textTransform: 'uppercase',
                  }}>{(l.keyword_count || 0)} words</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail */}
        <div style={{ padding: 56, overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
          {selected && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Eyebrow color={T.brand}>
                  Lesson {selected.lessonNumber} · {formatDate(selected.date)}
                </Eyebrow>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedAnalysis?.cefrBand && <Pill>{selectedAnalysis.cefrBand}</Pill>}
                  {selectedAnalysis?.overallScore && (
                    <Pill color={T.green} kind="ghost">{selectedAnalysis.overallScore}/100</Pill>
                  )}
                </div>
              </div>
              <h2 style={{
                fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
                fontSize: 40, lineHeight: 1.1, letterSpacing: -1,
                color: T.text, margin: '12px 0 32px', maxWidth: 760,
              }}>{selected.title || 'Untitled lesson'}</h2>

              <NumberTheatre items={[
                { label: 'Score',
                  value: selectedAnalysis?.overallScore || '—',
                  sub: averageScore ? `Avg ${averageScore}` : null },
                { label: 'Vocabulary',
                  value: selectedAnalysis?.vocabularyRange || '—' },
                { label: 'Words',
                  value: selected.keyword_count || 0 },
                { label: 'Patterns flagged',
                  value: (selectedAnalysis?.keyErrors || []).length },
              ]}/>

              {/* Summary */}
              {selectedAnalysis?.feedback && (
                <div style={{ marginTop: 40 }}>
                  <Eyebrow>The assessor&apos;s note</Eyebrow>
                  <div style={{
                    marginTop: 4, padding: '24px 28px',
                    background: T.panel, border: `1px solid ${T.ruleSoft}`,
                    fontFamily: FONTS.body, fontSize: 15, lineHeight: 1.7,
                    color: T.text,
                  }}>
                    {selectedAnalysis.feedback}
                  </div>
                </div>
              )}

              {/* Strengths + Improvements */}
              {(selectedAnalysis?.strengths?.length || selectedAnalysis?.improvements?.length) ? (
                <div style={{
                  marginTop: 40, display: 'grid',
                  gridTemplateColumns: '1fr 1fr', gap: 32,
                }}>
                  {selectedAnalysis?.strengths?.length > 0 && (
                    <div>
                      <Eyebrow color={T.brand}>What you nailed</Eyebrow>
                      <ul style={{
                        listStyle: 'none', padding: 0, margin: 0,
                      }}>
                        {selectedAnalysis.strengths.slice(0, 6).map((s, i) => (
                          <li key={i} style={{
                            padding: '12px 0', borderBottom: `1px solid ${T.ruleHair}`,
                            fontFamily: FONTS.body, fontSize: 14, lineHeight: 1.55,
                            color: T.textSoft,
                          }}>
                            <span style={{ color: T.brand, marginRight: 10, fontFamily: FONTS.mono, fontSize: 11 }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedAnalysis?.improvements?.length > 0 && (
                    <div>
                      <Eyebrow color={T.accent}>What to work on</Eyebrow>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {selectedAnalysis.improvements.slice(0, 6).map((s, i) => (
                          <li key={i} style={{
                            padding: '12px 0', borderBottom: `1px solid ${T.ruleHair}`,
                            fontFamily: FONTS.body, fontSize: 14, lineHeight: 1.55,
                            color: T.textSoft,
                          }}>
                            <span style={{ color: T.accent, marginRight: 10, fontFamily: FONTS.mono, fontSize: 11 }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Key errors */}
              {selectedAnalysis?.keyErrors?.length > 0 && (
                <div style={{ marginTop: 40 }}>
                  <Eyebrow color={T.accent}>Key errors · {selectedAnalysis.keyErrors.length}</Eyebrow>
                  <div style={{ marginTop: 4 }}>
                    {selectedAnalysis.keyErrors.slice(0, 8).map((e, i) => (
                      <div key={i} style={{
                        padding: '20px 0', borderBottom: `1px solid ${T.ruleHair}`,
                        display: 'grid', gridTemplateColumns: '1fr 1fr auto',
                        gap: 20, alignItems: 'start',
                      }}>
                        <div>
                          <div style={{
                            fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.22em',
                            textTransform: 'uppercase', color: T.accent, marginBottom: 4,
                          }}>Said</div>
                          <div style={{
                            fontFamily: FONTS.serif, fontStyle: 'italic',
                            fontSize: 16, color: T.text,
                          }}>&ldquo;{e.error}&rdquo;</div>
                        </div>
                        <div>
                          <div style={{
                            fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.22em',
                            textTransform: 'uppercase', color: T.brand, marginBottom: 4,
                          }}>Works</div>
                          <div style={{
                            fontFamily: FONTS.serif, fontStyle: 'italic',
                            fontSize: 16, color: T.text,
                          }}>&ldquo;{e.correction}&rdquo;</div>
                        </div>
                        <Pill kind="ghost">{e.category || 'language'}</Pill>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Words from lesson */}
              {selected.keywords?.length > 0 && (
                <div style={{ marginTop: 40 }}>
                  <Eyebrow>Words you took home · {selected.keywords.length}</Eyebrow>
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4,
                  }}>
                    {selected.keywords.slice(0, 24).map((k, i) => (
                      <span key={i} style={{
                        padding: '8px 14px',
                        background: T.panel, border: `1px solid ${T.ruleSoft}`,
                        fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 15,
                        color: T.text,
                      }}>{k.word}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Topics */}
              {selected.topics?.length > 0 && (
                <div style={{ marginTop: 40 }}>
                  <Eyebrow>What we worked on</Eyebrow>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {selected.topics.map(t => <Pill key={t} kind="outline">{t}</Pill>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function truncate(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
