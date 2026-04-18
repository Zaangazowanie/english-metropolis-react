import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../design-system/ThemeContext'
import { FONTS, EASE } from '../../design-system/tokens'
import {
  Eyebrow, Pill, Btn, Radar, Sparkline, MetricBar, NumberTheatre, Skyline,
} from '../../design-system/primitives'

const METRIC_KEYS = [
  { key: 'vocabularyRange',       label: 'Vocabulary' },
  { key: 'grammaticalAccuracy',   label: 'Grammar' },
  { key: 'fluencyAndCoherence',   label: 'Fluency' },
  { key: 'pronunciation',         label: 'Pronunciation' },
  { key: 'communicativeEffectiveness', label: 'Communication' },
]

function deriveMetrics(latest, all) {
  if (!latest) return []
  const allAvgs = {}
  if (all.length > 1) {
    for (const k of METRIC_KEYS) {
      const vals = all.slice(1).map(a => Number(a?.[k.key] || 0)).filter(v => v > 0)
      allAvgs[k.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined
    }
  }
  return METRIC_KEYS.map((k) => {
    const score = Number(latest?.[k.key] || 0)
    const avg = allAvgs[k.key]
    const prev = all[1] ? Number(all[1][k.key] || 0) : score
    return {
      key: k.key,
      label: k.label,
      score,
      avg: avg ? Math.round(avg) : Math.max(0, score - 4),
      delta: Math.round(score - prev),
      tier: score >= 80 ? 'Consolidating' : score >= 65 ? 'Developing' : 'Emerging',
    }
  })
}

export default function Dashboard({ data }) {
  const { T } = useTheme()
  const { profile, lessons = [], analyses = [], lessonCount = 0, keywordCount = 0 } = data || {}

  const latest = analyses[0]
  const metrics = useMemo(() => deriveMetrics(latest, analyses), [latest, analyses])
  const compositeTarget = Number(latest?.overallScore || 0)
  const previousScore = Number(analyses[1]?.overallScore || 0)
  const delta = compositeTarget && previousScore ? Math.round(compositeTarget - previousScore) : 0

  const [animatedScore, setAnimatedScore] = useState(0)
  useEffect(() => {
    if (!compositeTarget) return
    let r; const start = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 1400)
      const eased = 1 - Math.pow(1 - p, 3)
      setAnimatedScore(Math.round(eased * compositeTarget))
      if (p < 1) r = requestAnimationFrame(tick)
    }
    r = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(r)
  }, [compositeTarget])

  const band = latest?.cefrBand || profile?.level || 'B2'
  const firstName = profile?.firstName || 'friend'
  const now = new Date()
  const dayWord = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const hour = now.getHours()
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const nextTargetBand = band === 'B2' ? 'C1' : band === 'C1' ? 'C2' : band === 'B1' ? 'B2' : 'next'

  const lastSix = lessons.slice(0, 6)
  const history = [...analyses].reverse().map(a => Number(a?.overallScore || 0)).filter(v => v > 0)

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh' }}>
      {/* Hero strip */}
      <div style={{
        padding: '56px 56px 40px',
        borderBottom: `1px solid ${T.ruleSoft}`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: -100, top: -20,
          width: 700, height: 220, opacity: 0.18,
        }}>
          <Skyline color={T.brand}/>
        </div>
        <div style={{
          position: 'relative', display: 'grid',
          gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'end',
        }}>
          <div>
            <Eyebrow color={T.brand} sub={`${dayWord} · ${dateStr}`}>
              Vol. {lessonCount} · Edition of {firstName}
            </Eyebrow>
            <h1 style={{
              fontFamily: FONTS.serif, fontStyle: 'italic',
              fontWeight: 300, fontSize: 'clamp(48px, 6vw, 92px)',
              lineHeight: 0.95, letterSpacing: -2, margin: '14px 0 0',
              color: T.text, maxWidth: 900,
            }}>
              {salutation}, <span style={{ color: T.brand }}>{firstName}</span>.
              {compositeTarget > 0 && band !== 'next' && (
                <>
                  <br/>You&apos;re pressing on towards{' '}
                  <span style={{
                    fontStyle: 'normal', fontFamily: FONTS.label,
                    fontWeight: 600, fontSize: 'clamp(34px, 4.4vw, 64px)',
                    letterSpacing: 2, color: T.accent, verticalAlign: 'baseline',
                  }}>{nextTargetBand}</span>.
                </>
              )}
            </h1>
          </div>
          {compositeTarget > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.28em',
                textTransform: 'uppercase', color: T.textMute, marginBottom: 4,
              }}>Composite · Lesson {lessonCount}</div>
              <div style={{
                fontFamily: FONTS.serif, fontSize: 132, lineHeight: 0.9,
                letterSpacing: -5, color: T.brand, fontWeight: 300,
              }}>{animatedScore}</div>
              {delta !== 0 && (
                <div style={{
                  fontFamily: FONTS.mono, fontSize: 11,
                  color: delta >= 0 ? T.green : T.accent, marginTop: -4,
                }}>
                  {delta >= 0 ? '+' : ''}{delta} since L{lessonCount - 1}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Number theatre */}
      <div style={{ padding: '40px 56px 0' }}>
        <NumberTheatre items={[
          { label: 'Lessons archived', value: lessonCount },
          { label: 'Words in your corpus', value: keywordCount },
          { label: 'Analyses scored', value: analyses.length },
          { label: 'Band', value: band, sub: latest?.overallScore ? `${latest.overallScore}/100` : null },
        ]}/>
      </div>

      {/* Two-column body */}
      <div style={{
        padding: '40px 56px 80px',
        display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 40,
      }}>
        <div>
          <Eyebrow>Five axes · CEFR</Eyebrow>
          <h2 style={{
            fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 36,
            lineHeight: 1.05, letterSpacing: -1, color: T.text,
            margin: '4px 0 28px', fontWeight: 300, maxWidth: 480,
          }}>
            {latest ? `Where you stood after the ${ordinal(lessonCount)}.` : 'Your first analysis will appear here.'}
          </h2>
          {metrics.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 320px', gap: 36,
              alignItems: 'start',
            }}>
              <div>
                {metrics.map(m => <MetricBar key={m.key} m={m}/>)}
                <div style={{
                  marginTop: 18, fontFamily: FONTS.body, fontStyle: 'italic',
                  fontSize: 13, color: T.textMute,
                }}>
                  Brass solid line = your current score. Dotted ring = your running
                  average across the prior {Math.max(0, analyses.length - 1)} sessions.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Radar metrics={metrics} size={300}/>
              </div>
            </div>
          )}
        </div>

        <div>
          <Eyebrow color={T.accent}>Latest lesson</Eyebrow>
          {latest ? (
            <div style={{
              background: T.panel, border: `1px solid ${T.rule}`,
              padding: 28, marginTop: 4,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: FONTS.mono, fontSize: 10, color: T.textMute,
                letterSpacing: 1, marginBottom: 14,
              }}>
                <span>L · {String(lessonCount).padStart(2, '0')}</span>
                <span>{formatDate(latest.date)}</span>
              </div>
              <h3 style={{
                fontFamily: FONTS.serif, fontStyle: 'italic',
                fontWeight: 300, fontSize: 28, lineHeight: 1.15, letterSpacing: -0.5,
                color: T.text, margin: '0 0 24px',
              }}>
                {latest.lessonTitle || 'Lesson'}
              </h3>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
                padding: '18px 0',
                borderTop: `1px solid ${T.ruleSoft}`, borderBottom: `1px solid ${T.ruleSoft}`,
              }}>
                {[
                  ['Score', compositeTarget, T.brand],
                  ['Band', band, T.text],
                  ['Strengths', (latest.strengths || []).length, T.accent],
                ].map(([l, v, c], i) => (
                  <div key={i}>
                    <div style={{
                      fontFamily: FONTS.label, fontSize: 9, letterSpacing: '0.22em',
                      textTransform: 'uppercase', color: T.textMute, marginBottom: 4,
                    }}>{l}</div>
                    <div style={{
                      fontFamily: FONTS.serif, fontStyle: 'italic',
                      fontSize: 38, color: c, lineHeight: 1, letterSpacing: -1,
                    }}>{v}</div>
                  </div>
                ))}
              </div>
              {latest.topics?.length > 0 && (
                <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {latest.topics.slice(0, 5).map(t => <Pill key={t} kind="ghost">{t}</Pill>)}
                </div>
              )}
              <div style={{ marginTop: 24 }}>
                <Btn kind="outline"
                  onClick={() => window.location.assign(`/app/${profile.slug}/lessons`)}>
                  Read the analysis
                </Btn>
              </div>
            </div>
          ) : (
            <div style={{
              background: T.panel, border: `1px solid ${T.rule}`,
              padding: 28, fontFamily: FONTS.body, fontStyle: 'italic',
              fontSize: 14, color: T.textMute,
            }}>
              Once your first lesson is analysed, its report will sit here — title,
              topics, scores, and an invitation to read the full assessment.
            </div>
          )}

          {history.length > 1 && (
            <div style={{ marginTop: 40 }}>
              <Eyebrow>Composite · your arc</Eyebrow>
              <div style={{
                padding: '20px 0', borderTop: `1px solid ${T.ruleSoft}`,
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
              }}>
                <Sparkline data={history} w={260} h={60}/>
                <div style={{
                  textAlign: 'right',
                  fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 32,
                  color: T.brand, letterSpacing: -1,
                }}>
                  {history[history.length - 1]}
                  <span style={{
                    fontFamily: FONTS.mono, fontSize: 11, color: T.textMute,
                    marginLeft: 8,
                  }}>/ avg {Math.round(history.reduce((a, b) => a + b, 0) / history.length)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity strip */}
      {lastSix.length > 0 && (
        <div style={{ padding: '0 56px 80px' }}>
          <Eyebrow color={T.brand}>The lesson archive · last {lastSix.length}</Eyebrow>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(6, lastSix.length)}, 1fr)`,
            gap: 1, background: T.ruleSoft, border: `1px solid ${T.ruleSoft}`,
          }}>
            {lastSix.map((l, i) => {
              const a = analyses.find(x => x.lessonId === l.id) || analyses[i] || {}
              const score = Number(a.overallScore || 0)
              const sparkData = score > 0
                ? [Math.max(0, score - 4), Math.max(0, score - 2), score]
                : null
              return (
                <div key={l.id} style={{ background: T.panel, padding: 20 }}>
                  <div style={{
                    fontFamily: FONTS.mono, fontSize: 9, color: T.textMute, marginBottom: 8,
                  }}>L·{String(l.lessonNumber).padStart(2, '0')} · {formatDate(l.date)}</div>
                  <div style={{
                    fontFamily: FONTS.serif, fontStyle: 'italic',
                    fontSize: 16, lineHeight: 1.25, color: T.text,
                    margin: '0 0 16px', minHeight: 48,
                  }}>{truncate(l.title || 'Untitled', 48)}</div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  }}>
                    {sparkData ? <Sparkline data={sparkData} w={50} h={20}/> : <span/>}
                    <div style={{
                      fontFamily: FONTS.serif, fontSize: 26,
                      color: score > 0 ? T.brand : T.textFade, lineHeight: 1,
                    }}>{score > 0 ? score : '–'}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ───── helpers ─────

function ordinal(n) {
  if (!n) return 'first'
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function truncate(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}
