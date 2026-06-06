// Curriculum — the student's full course page (built 2026-06-04, expanded into a
// course-detail view 2026-06-06, reorganised into collapsible sections 2026-06-06).
//
// Renders the per-student pilot course from curriculum:listCurriculum:
//   • course header (level → target, lesson + completed counts, progress)
//   • the NEXT lesson, highlighted + bookable, with its outcome/topics/keywords
//   • collapsible "Completed" and "Coming soon" sections (the rest of the 30)
//   • a collapsible "full library" section (8 tracks × Winter 30 / Summer 12) of
//     greyed coming-soon courses — structure only, lesson names TBD.
//
// Each lesson row expands to its learning outcome, discussion topics and
// prescribed key vocabulary. Hides itself when the student has no curriculum.

import { useEffect, useState, useCallback } from 'react'
import { FONT } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Glass, Btn, Pill } from '../../design/v3/primitives.jsx'
import { useStudentAuth } from '../../contexts/StudentAuthContext.jsx'
import { useI18n } from '../../i18n'
import { CONVEX_URL } from '../../data/studentConfig.js'

// The full course library — structure from the 2026-06-04 master plan. The
// individual lesson names aren't generated yet, so the pack is shown as greyed
// "coming soon" courses with their semester lesson counts (Winter 30 / Summer 12).
const PACK_TRACKS = [
  { code: 'A1', name: 'A1 · Beginner' },
  { code: 'A2', name: 'A2 · Elementary' },
  { code: 'B1', name: 'B1 · Intermediate' },
  { code: 'B2', name: 'B2 · Upper-Intermediate' },
  { code: 'C1', name: 'C1 · Advanced' },
  { code: 'C2', name: 'C2 · Proficiency' },
  { code: 'BE', name: 'Business English' },
  { code: 'LE', name: 'Legal English' },
]
const WINTER_COUNT = 30
const SUMMER_COUNT = 12

async function convexQuery(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`)
  const payload = await res.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || path)
  return payload.value
}

export default function Curriculum() {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const { studentUser } = useStudentAuth()
  const studentId = studentUser?._id

  const [state, setState] = useState({ loading: true, items: [], hidden: true })
  const [openPos, setOpenPos] = useState(null)              // expanded lesson row
  const [sec, setSec] = useState({ done: false, soon: true, pack: false }) // open accordions
  const toggleSec = k => setSec(s => ({ ...s, [k]: !s[k] }))

  const load = useCallback(async () => {
    if (!studentId) { setState({ loading: false, items: [], hidden: true }); return }
    try {
      const items = await convexQuery('curriculum:listCurriculum', { studentId })
      setState({ loading: false, items: items || [], hidden: !items || items.length === 0 })
    } catch {
      setState({ loading: false, items: [], hidden: true })
    }
  }, [studentId])

  useEffect(() => { load() }, [load])

  if (state.loading || state.hidden) return null

  const items = [...state.items].sort((a, b) => a.position - b.position)
  const total = items.length
  const doneItems = items.filter(i => i.status === 'taught')
  const planned = items.filter(i => i.status !== 'taught')
  const nextUp = planned[0] || null
  const soonItems = planned.slice(1)
  const taught = doneItems.length
  const pct = total ? Math.round((taught / total) * 100) : 0
  const targetCefr = items[items.length - 1]?.targetCefr || studentUser?.targetLevel || 'C2'
  const startCefr = studentUser?.level || items[0]?.targetCefr || ''

  const scrollToBooking = () => {
    const el = document.getElementById('lesson-booking')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const sectionLabel = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.28em',
    textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 10,
  }
  const heading = {
    fontFamily: FONT.display, fontWeight: 600, fontSize: isMobile ? 24 : 32,
    lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0, color: T.text,
  }
  const numStyle = { fontFamily: FONT.mono, fontSize: 12, minWidth: 24, textAlign: 'right' }

  // Collapsible section header (the "dropdown" affordance).
  function Accordion({ id, title, count, accent, children }) {
    const isOpen = sec[id]
    return (
      <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
        <button type="button" onClick={() => toggleSec(id)} aria-expanded={isOpen}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: accent || T.textDim }}>{title}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.textMute }}>{count}</span>
          <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: 22, color: T.textMute }}>
            {isOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {isOpen && <div style={{ marginTop: 12 }}>{children}</div>}
      </div>
    )
  }

  // One lesson card. `tone`: 'done' | 'next' | 'soon'. Next is always expanded.
  function LessonCard(it) {
    const tone = it.status === 'taught' ? 'done' : (it === nextUp ? 'next' : 'soon')
    const soon = tone === 'soon'
    const isNext = tone === 'next'
    const open = isNext || openPos === it.position
    const hasDetail = !!(it.aim || (it.topics?.length) || (it.keywords?.length) || it.languageFocus)
    const ink = soon ? T.textDim : T.text
    return (
      <div key={it.position} style={{
        borderRadius: 14, marginBottom: 8,
        border: `1px solid ${isNext ? 'rgba(217,70,239,0.35)' : T.border}`,
        background: isNext ? 'rgba(217,70,239,0.06)' : (soon ? 'transparent' : T.surface),
        opacity: soon && !open ? 0.62 : 1,
        transition: 'opacity .2s ease',
      }}>
        <button
          type="button"
          onClick={() => !isNext && hasDetail && setOpenPos(open ? null : it.position)}
          style={{
            width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
            cursor: (!isNext && hasDetail) ? 'pointer' : 'default', padding: isMobile ? '12px 14px' : '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
          {tone === 'done'
            ? <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.emerald }}>check_circle</span>
            : <span style={{ ...numStyle, color: T.textDim }}>{it.position}</span>}
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: isNext ? 700 : 500, color: ink, lineHeight: 1.3 }}>{it.title}</span>
          {it.targetCefr && (
            <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, color: T.textDim,
              border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 6px' }}>{it.targetCefr}</span>
          )}
          {soon && <Pill tone="neutral" size="sm">{t('curriculum.comingSoon')}</Pill>}
          {!isNext && hasDetail && (
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.textMute }}>
              {open ? 'expand_less' : 'expand_more'}
            </span>
          )}
        </button>

        {open && hasDetail && (
          <div style={{ padding: isMobile ? '0 14px 14px 14px' : '0 18px 16px 18px', display: 'grid', gap: 12 }}>
            {it.aim && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim, marginBottom: 4 }}>{t('curriculum.outcome')}</div>
                <div style={{ fontSize: 13.5, color: T.textSoft, lineHeight: 1.55 }}>{it.aim}</div>
              </div>
            )}
            {it.topics?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>{t('curriculum.topics')}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {it.topics.map((tp, i) => <Pill key={i} tone="violet" size="sm">{tp}</Pill>)}
                </div>
              </div>
            )}
            {it.languageFocus && (
              <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: T.textDim }}>{t('curriculum.focus')}: </span>{it.languageFocus}
              </div>
            )}
            {it.keywords?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>{t('curriculum.keywords')}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {it.keywords.map((kw, i) => (
                    <span key={i} style={{ fontFamily: FONT.mono, fontSize: 11.5, color: T.textSoft,
                      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, padding: '3px 8px' }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}
            {isNext && (
              <div>
                <Btn variant="primary" size="md" icon="event" onClick={scrollToBooking}>{t('curriculum.bookCta')}</Btn>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div id="curriculum" style={{ marginBottom: 28, display: 'grid', gap: 18 }}>
      {/* ── Active pilot course ───────────────────────────────────── */}
      <Glass padding={isMobile ? 20 : 30}>
        <div style={sectionLabel}>{t('curriculum.kicker')}</div>
        <h2 style={heading}>{t('curriculum.courseName')}</h2>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: T.textSoft }}>
          <span>{t('curriculum.semester')}</span>
          {startCefr && (
            <span style={{ fontFamily: FONT.mono, fontWeight: 700, color: T.brandInk || T.brand }}>{startCefr} → {targetCefr}</span>
          )}
          <span style={{ color: T.textMute }}>·</span>
          <span style={{ fontFamily: FONT.mono }}>{t('curriculum.lessonsCount', { n: total })}</span>
        </div>

        {/* progress */}
        <div style={{ marginTop: 16, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160, height: 8, borderRadius: 99, background: T.surface, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: T.emerald, transition: 'width .4s ease' }} />
          </div>
          <span style={{ fontSize: 13, color: T.textSoft, fontFamily: FONT.mono }}>
            {t('curriculum.progress', { done: taught, total })}
          </span>
        </div>

        {/* next lesson — always visible + expanded */}
        {nextUp && (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>{t('curriculum.nextUp')}</div>
            {LessonCard(nextUp)}
          </div>
        )}

        {/* collapsible: completed */}
        {taught > 0 && (
          <Accordion id="done" title={t('curriculum.done')} count={taught}>
            {doneItems.map(it => LessonCard(it))}
          </Accordion>
        )}

        {/* collapsible: coming soon */}
        {soonItems.length > 0 && (
          <Accordion id="soon" title={t('curriculum.comingSoon')} count={soonItems.length} accent={T.brandInk || T.brand}>
            {soonItems.map(it => LessonCard(it))}
          </Accordion>
        )}
      </Glass>

      {/* ── The full library — collapsible, coming soon ───────────── */}
      <Glass padding={isMobile ? 20 : 30}>
        <button type="button" onClick={() => toggleSec('pack')} aria-expanded={sec.pack}
          style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={sectionLabel}>{t('curriculum.packKicker')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ ...heading, flex: 1 }}>{t('curriculum.packTitle')}</h2>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: T.textMute }}>
              {sec.pack ? 'expand_less' : 'expand_more'}
            </span>
          </div>
        </button>
        <div style={{
          marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.30)',
          color: T.brandInk || T.brand, borderRadius: 999, padding: '6px 14px',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>schedule</span>
          {t('curriculum.comingSoon')}
        </div>

        {sec.pack && (
          <>
            <div style={{ fontSize: 13, color: T.textSoft, margin: '16px 0', lineHeight: 1.5 }}>
              {t('curriculum.packSub', { courses: PACK_TRACKS.length * 2, lessons: PACK_TRACKS.length * (WINTER_COUNT + SUMMER_COUNT) })}
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
              {PACK_TRACKS.map(tr => (
                <div key={tr.code} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  borderRadius: 12, border: `1px dashed ${T.border}`, background: 'transparent',
                  padding: isMobile ? '12px 14px' : '14px 16px', opacity: 0.6,
                }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: T.textDim,
                    border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 8px', minWidth: 36, textAlign: 'center' }}>{tr.code}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.textDim }}>{tr.name}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 11, color: T.textMute }}>
                    {t('curriculum.winter')} {WINTER_COUNT} · {t('curriculum.summer')} {SUMMER_COUNT}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Glass>
    </div>
  )
}
