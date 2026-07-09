import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FONT, G, CEFR_COLOR } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, MetricBar, Pill, Skeleton, useNumberFlow } from '../../design/v3/primitives.jsx'
import { useI18n } from '../../i18n'
import { fetchJSONCached } from '../../practice/lib/practice-cache'

// Build a friendly "Tuesday, 28 April · 17:00 CEST" string for an upcoming
// lesson. Weekday + month names come from the i18n dictionary so the line
// renders in Polish for PL students. CEST/CET label tracks Apr–Oct.
function formatUpcomingDateTime(t, dateStr, timeStr) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return dateStr
  // Use a date pinned to 12:00 UTC to avoid TZ weirdness when extracting the
  // weekday — we only care about Y/M/D for the label.
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const weekday = t(`weekday.${noon.getUTCDay()}`)
  const month = t(`month.${m}`)
  const tzLabel = m >= 4 && m <= 10 ? 'CEST' : 'CET'
  const time = timeStr ? ` · ${timeStr} ${tzLabel}` : ''
  return `${weekday}, ${d} ${month}${time}`
}

function describeUpcomingProximity(t, startAtMs, nowMs, durationMin = 60) {
  if (!startAtMs) return { label: '', urgency: 'none' }
  const diffMs = startAtMs - nowMs
  const diffMin = Math.round(diffMs / 60000)
  const endAt = startAtMs + durationMin * 60000
  if (nowMs >= startAtMs && nowMs < endAt) {
    return { label: t('dashboard.upcoming.inSession'), urgency: 'live' }
  }
  if (diffMin < 0) {
    const ago = Math.abs(diffMin)
    if (ago < 60) return { label: t('dashboard.upcoming.endedMin', { n: ago }), urgency: 'past' }
    return { label: t('dashboard.upcoming.endedHr', { n: Math.round(ago / 60) }), urgency: 'past' }
  }
  if (diffMin <= 60) return { label: t('dashboard.upcoming.startsInMin', { n: diffMin }), urgency: 'imminent' }
  if (diffMin <= 60 * 24) {
    const h = Math.floor(diffMin / 60), mn = diffMin % 60
    return { label: t('dashboard.upcoming.startsInHrMin', { h, m: String(mn).padStart(2,'0') }), urgency: 'today' }
  }
  const days = Math.floor(diffMin / (60 * 24))
  if (days === 1) return { label: t('dashboard.upcoming.tomorrow'), urgency: 'soon' }
  if (days < 7) return { label: t('dashboard.upcoming.inDays', { n: days }), urgency: 'soon' }
  return { label: t('dashboard.upcoming.inDays', { n: days }), urgency: 'later' }
}

// Metric keys match the Convex-stored analysis schema. The `labelKey` resolves
// to a Polish label for PL students; `practice` stays in English (it's a route
// param consumed by the Practice arena).
const METRICS = [
  { k: 'grammaticalAccuracy', labelKey: 'grammar', practice: 'grammar', color: '#8B5CF6' },
  { k: 'vocabularyRange', labelKey: 'vocabulary', practice: 'vocabulary', color: '#D946EF' },
  { k: 'pronunciation', labelKey: 'pronunciation', practice: 'pronunciation', color: '#F472B6' },
  { k: 'fluencyAndCoherence', labelKey: 'fluency', practice: 'fluency', color: '#FB923C' },
  { k: 'communicativeEffectiveness', labelKey: 'communication', practice: 'communicative', color: '#34D399' },
]

function numberOr(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function StatTile({ label, value, icon }) {
  const { T } = useV3Theme()
  return (
    <Glass padding={20} style={{ textAlign: 'center' }}>
      <span className="material-symbols-outlined"
        style={{ fontSize: 22, color: T.textDim, marginBottom: 4 }}>{icon}</span>
      <div style={{ fontFamily: FONT.display, fontSize: 34, fontWeight: 600,
        lineHeight: 1, letterSpacing: '-0.02em',
        background: G.brand, WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        marginTop: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: T.textDim, marginTop: 6 }}>{label}</div>
    </Glass>
  )
}

function MetricCard({ axis, score, slug, basePath }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  const color = axis.color
  const tier = score >= 85 ? t('dashboard.metric.tier.mastery')
    : score >= 70 ? t('dashboard.metric.tier.confident')
    : score >= 55 ? t('dashboard.metric.tier.building')
    : t('dashboard.metric.tier.foundations')
  const label = t(`dashboard.metric.label.${axis.labelKey}`)
  const practicePath = slug ? `${basePath}/${slug}/practice?category=${axis.practice}` : '#'
  return (
    <Glass padding={18} hover>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: T.textDim }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <div style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 600,
          color: T.text, letterSpacing: '-0.02em', lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 12, color: T.textDim, fontFamily: FONT.mono }}>/100</div>
      </div>
      <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2,
        letterSpacing: '0.06em' }}>{tier}</div>
      <div style={{ marginTop: 10 }}><MetricBar value={score} color={color}/></div>
      <Link to={practicePath}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10,
          fontSize: 11, color: T.textDim, textDecoration: 'none',
          letterSpacing: '0.04em' }}>
        {t('dashboard.metric.drill', { label })}
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
      </Link>
    </Glass>
  )
}

function LatestLessonCard({ lesson, slug, basePath }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  if (!lesson) {
    return (
      <Glass padding={28} hover style={{ minHeight: 220 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em',
          textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>
          {t('dashboard.latest.kicker')}
        </div>
        <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
          lineHeight: 1.2, color: T.text, marginTop: 4 }}>
          {t('dashboard.latest.empty.title')}
        </div>
        <p style={{ marginTop: 10, fontSize: 14, color: T.textDim, lineHeight: 1.55 }}>
          {t('dashboard.latest.empty.body')}
        </p>
      </Glass>
    )
  }
  const overall = numberOr(lesson.analysis?.overallScore)
  const band = lesson.analysis?.cefrBand || 'C1'
  const date = lesson.date || ''
  const topics = (lesson.topics || []).slice(0, 4)
  const lessonPath = slug ? `${basePath}/${slug}/lessons?openLesson=${lesson.id}` : '#'
  return (
    <Glass padding={28} hover>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em',
            textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>
            {t('dashboard.latest.kickerDated', { date })}
          </div>
          <div style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: 600,
            lineHeight: 1.15, letterSpacing: '-0.01em', color: T.text,
            maxWidth: 640 }}>
            {lesson.title || t('dashboard.latest.fallbackTitle')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Pill tone="brand">{band}</Pill>
          {overall > 0 && (
            <div style={{ fontFamily: FONT.display, fontSize: 38, fontWeight: 600,
              background: G.brand, WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              lineHeight: 1 }}>
              {overall}
            </div>
          )}
        </div>
      </div>
      {topics.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {topics.map(t => <Pill key={t} tone="neutral" size="sm">{t}</Pill>)}
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <Link to={lessonPath} style={{ textDecoration: 'none' }}>
          <Btn variant="primary" size="md" trailingIcon="arrow_forward">
            {t('dashboard.latest.readAnalysis')}
          </Btn>
        </Link>
      </div>
    </Glass>
  )
}

function UpcomingLessonCard({ upcoming, slug, basePath }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  const nowMs = Date.now()
  const startAt = upcoming?.startAtMs || 0
  const prox = describeUpcomingProximity(t, startAt, nowMs)
  const isLive = prox.urgency === 'live'
  const isImminent = prox.urgency === 'imminent'
  const joinVariant = isLive ? 'primary' : isImminent ? 'ember' : 'primary'
  const joinLabel = isLive ? t('dashboard.upcoming.joinNow') : t('dashboard.upcoming.joinMeet')
  const joinIcon = isLive ? 'radio_button_checked' : 'videocam'

  // Empty state — calm, on-tone with the rest of the hero row.
  if (!upcoming) {
    return (
      <Glass padding={28} hover style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', minHeight: 220,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em',
            textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>
            {t('dashboard.upcoming.kicker')}
          </div>
          <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
            lineHeight: 1.2, letterSpacing: '-0.01em', color: T.text,
            marginTop: 4 }}>
            {t('dashboard.upcoming.empty.title')}
          </div>
          <p style={{ marginTop: 10, fontSize: 14, color: T.textDim,
            lineHeight: 1.55 }}>
            {t('dashboard.upcoming.empty.body')}
          </p>
        </div>
        <div style={{ marginTop: 16 }}>
          <Link to={slug ? `${basePath}/${slug}/calendar` : '#'} style={{ textDecoration: 'none' }}>
            <Btn variant="secondary" size="md" trailingIcon="arrow_forward">
              {t('dashboard.upcoming.openCalendar')}
            </Btn>
          </Link>
        </div>
      </Glass>
    )
  }

  const niceDate = formatUpcomingDateTime(t, upcoming.date, upcoming.startTime)
  const topic = (upcoming.topics || [])[0]
  const meet = upcoming.meetingUrl
  const lessonPath = slug ? `${basePath}/${slug}/lessons?openLesson=${upcoming.id}` : '#'

  return (
    <Glass padding={28} hover style={{
      position: 'relative',
      borderColor: isLive ? T.emerald : undefined,
      boxShadow: isLive ? `0 0 0 2px ${T.emerald}, 0 0 40px -8px ${T.emerald}` : undefined,
    }}>
      {isLive && (
        <span aria-hidden style={{
          position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: '50%',
          background: T.emerald, animation: 'emPulse 1.4s ease infinite',
          boxShadow: `0 0 14px ${T.emerald}`,
        }}/>
      )}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em',
        textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>
        {t('dashboard.upcoming.kicker')}
      </div>
      {/* Date is the visual anchor here so the upcoming card is instantly
          distinct from the latest-lesson card next to it (per Mike's spec).
          Lesson title becomes the supporting line. */}
      <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
        lineHeight: 1.2, letterSpacing: '-0.01em', color: T.text,
        marginTop: 4 }}>
        {niceDate}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: T.textSoft,
        lineHeight: 1.45 }}>
        {upcoming.title || t('dashboard.upcoming.fallbackTitle')}
      </div>
      {(topic || prox.label) && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {topic && <Pill tone="violet" size="sm">{topic}</Pill>}
          {prox.label && (
            <Pill tone={isLive ? 'emerald' : isImminent ? 'amber' : 'neutral'} size="sm"
              icon={isLive ? 'sensors' : 'schedule'}>
              {prox.label}
            </Pill>
          )}
        </div>
      )}
      <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {meet ? (
          <a href={meet} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}>
            <Btn variant={joinVariant} size="md" icon={joinIcon}>
              {joinLabel}
            </Btn>
          </a>
        ) : (
          <Btn variant="ghost" size="md" icon="videocam" disabled>
            {t('dashboard.upcoming.meetPending')}
          </Btn>
        )}
        <Link to={lessonPath} style={{ textDecoration: 'none' }}>
          <Btn variant="secondary" size="md" trailingIcon="arrow_forward">
            {t('dashboard.upcoming.lessonPreview')}
          </Btn>
        </Link>
      </div>
    </Glass>
  )
}

// The "do it now" revision card — deep-links into the flashcard deck
// pre-filtered to the latest lesson's keywords (Vocabulary ?lesson=<date>).
function ReviseCard({ lesson, slug, basePath }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  const kwCount = numberOr(lesson?.keyword_count)
  const deckPath = slug
    ? `${basePath}/${slug}/vocabulary${lesson?.date ? `?lesson=${lesson.date}` : ''}`
    : '#'
  const allPath = slug ? `${basePath}/${slug}/vocabulary` : '#'
  return (
    <Glass padding={28} hover style={{ display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', minHeight: 220 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em',
          textTransform: 'uppercase', color: T.textDim, marginBottom: 6,
          display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: T.brand }}>style</span>
          {t('dashboard.revise.kicker')}
        </div>
        <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
          lineHeight: 1.2, letterSpacing: '-0.01em', color: T.text, marginTop: 4 }}>
          {lesson ? t('dashboard.revise.title') : t('dashboard.revise.empty.title')}
        </div>
        <p style={{ marginTop: 10, fontSize: 14, color: T.textDim, lineHeight: 1.55 }}>
          {lesson && kwCount
            ? t('dashboard.revise.body', { n: kwCount })
            : t('dashboard.revise.empty.body')}
        </p>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link to={deckPath} style={{ textDecoration: 'none' }}>
          <Btn variant="primary" size="md" icon="style">
            {t('dashboard.revise.cta')}
          </Btn>
        </Link>
        {lesson && (
          <Link to={allPath} style={{ textDecoration: 'none' }}>
            <Btn variant="ghost" size="md">
              {t('dashboard.revise.all')}
            </Btn>
          </Link>
        )}
      </div>
    </Glass>
  )
}

function RecentLessons({ lessons, slug, basePath }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  if (!lessons.length) return null
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em',
        textTransform: 'uppercase', color: T.textDim, marginBottom: 14 }}>
        {t('dashboard.recent.kicker')}
      </div>
      <div style={{ display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 16 }}>
        {lessons.slice(0, 3).map(lesson => {
          const band = lesson.analysis?.cefrBand || '—'
          const overall = numberOr(lesson.analysis?.overallScore)
          const path = slug ? `${basePath}/${slug}/lessons?openLesson=${lesson.id}` : '#'
          return (
            <Link key={lesson.id} to={path}
              style={{ textDecoration: 'none', color: 'inherit' }}>
              <Glass padding={20} hover style={{ height: '100%' }}>
                <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.textDim,
                  letterSpacing: '0.08em' }}>{lesson.date}</div>
                <div style={{ fontFamily: FONT.display, fontSize: 16, fontWeight: 600,
                  color: T.text, marginTop: 6, lineHeight: 1.3, minHeight: 42,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden' }}>
                  {lesson.title || `${t('dashboard.recent.lessonFallback')} ${lesson.lessonNumber || ''}`}
                </div>
                <div style={{ marginTop: 12, display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center' }}>
                  <Pill tone="neutral" size="sm">
                    {t('dashboard.recent.wordsCount', { n: lesson.keyword_count || 0 })}
                  </Pill>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.2em', textTransform: 'uppercase',
                      color: CEFR_COLOR[band] || T.textDim }}>{band}</span>
                    {overall > 0 && (
                      <span style={{ fontFamily: FONT.mono, fontSize: 13,
                        fontWeight: 600, color: T.text }}>{overall}</span>
                    )}
                  </div>
                </div>
              </Glass>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// Expandable lesson-summary block — replaces the old hard-truncate at 220
// chars on the Dashboard hero. Mike's spec: "if it cuts off, give an option
// to read more or navigate to a section showing the full text". This shows
// ~220 chars by default with a "Read more / Czytaj więcej" link that expands
// inline. Both EN and PL labels routed through the i18n dictionary so the
// CTA tracks the language toggle.
function ExpandableSummary({ text, T, preferShort, t }) {
  const [expanded, setExpanded] = useState(false)
  const FOLD_AT = 220
  const needsFold = preferShort && String(text).length > FOLD_AT
  const shown = !needsFold || expanded
    ? String(text)
    : `${String(text).slice(0, FOLD_AT).replace(/\s+\S*$/, '')}…`
  return (
    <div style={{ marginTop: 20, maxWidth: 700 }}>
      <p style={{ margin: 0, fontSize: 17, color: T.textDim, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {shown}
      </p>
      {needsFold && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 10,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: FONT.body,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: T.brand,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}>
          {expanded ? t('dashboard.summary.readLess') : t('dashboard.summary.readMore')}
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      )}
    </div>
  )
}

export default function DashboardV3({ data, slug, basePath = '' }) {
  const { T, isMobile } = useV3Theme()
  const { t, lang } = useI18n()
  const allLessons = data?.lessons || []
  // Latest Lesson should reference *completed* lessons, not the next planned
  // session — otherwise an upcoming lesson would push the most recent
  // analysed lesson out of view.
  const lessons = useMemo(
    () => allLessons.filter(l => (l.status || '') !== 'planned'),
    [allLessons],
  )
  const upcomingLesson = data?.upcomingLesson || null
  const latestAnalysisRaw = data?.latestAnalysis
  const profile = data?.profile || {}
  const firstName = profile.firstName || t('dashboard.studentDefaultName')
  const cefr = profile.level || latestAnalysisRaw?.cefrBand || '—'
  const composite = useNumberFlow(numberOr(data?.averageScore))
  const [progressOpen, setProgressOpen] = useState(false)

  // Bilingual overlay — fetch /lesson-summaries/<slug>.json once and
  // merge per-date PL + EN-simple fields onto the matching analysis. Lets
  // us add Polish summaries without a Convex schema migration. Falls back
  // silently to the original Convex doc if the overlay file 404s.
  const [overlay, setOverlay] = useState(null)
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    // 30s timeout + 5-min cache so the lesson-summaries overlay isn't
    // re-pulled on every dashboard remount.
    const url = `/lesson-summaries/${slug}.json`
    fetchJSONCached(url, { cacheKey: `lesson-summaries::${url}` })
      .then(d => { if (!cancelled) setOverlay(d || {}) })
      .catch(() => { if (!cancelled) setOverlay({}) })
    return () => { cancelled = true }
  }, [slug])

  // Pick the right field per (lang, CEFR). Polish students at A1/A2/B1
  // see the detailed Polish summary; English-mode A1/A2/B1 students see
  // the simplified A2 English; B2+ stays with the original B2 English.
  const latestAnalysis = useMemo(() => {
    if (!latestAnalysisRaw) return latestAnalysisRaw
    const date = String(latestAnalysisRaw.date || '').slice(0, 10)
    const o = overlay && date && overlay[date] ? overlay[date] : null
    const lower = ['A1', 'A2', 'B1'].includes(String(profile.level || '').toUpperCase())
    const merged = { ...latestAnalysisRaw }
    if (o) {
      if (lang === 'pl' && o.lessonSummaryPL) merged.lessonSummary = o.lessonSummaryPL
      else if (lang === 'en' && lower && o.lessonSummaryENSimple) merged.lessonSummary = o.lessonSummaryENSimple
      if (lang === 'pl' && o.topicHighlightsPL) merged.topicHighlights = o.topicHighlightsPL
      if (lang === 'pl' && o.strengthsPL) merged.strengths = o.strengthsPL
      else if (lang === 'en' && lower && o.strengthsENSimple) merged.strengths = o.strengthsENSimple
      if (lang === 'pl' && o.improvementsPL) merged.improvements = o.improvementsPL
      else if (lang === 'en' && lower && o.improvementsENSimple) merged.improvements = o.improvementsENSimple
    }
    return merged
  }, [latestAnalysisRaw, overlay, lang, profile.level])

  // Real Convex analyses store each metric under its key directly (e.g.
  // latestAnalysis.grammaticalAccuracy) matching AnalyticsPrimitives METRICS.
  // Fallback to nested `.scores.<key>` if ever shaped that way.
  const metricScores = useMemo(() => {
    if (!latestAnalysis) return null
    const scores = latestAnalysis.scores || {}
    const pick = (k) => numberOr(latestAnalysis[k] ?? scores[k], 0)
    const anyFound = METRICS.some((m) => pick(m.k) > 0)
    if (!anyFound) return null
    return Object.fromEntries(METRICS.map((m) => [m.k, pick(m.k)]))
  }, [latestAnalysis])

  if (data?.loading) {
    return (
      <div style={{ maxWidth: 1320, margin: '0 auto',
        padding: isMobile ? '24px 18px 80px' : '40px 32px 80px' }}>
        <Skeleton h={120} style={{ marginBottom: 24 }}/>
        <Skeleton h={200} style={{ marginBottom: 16 }}/>
        <Skeleton h={240}/>
      </div>
    )
  }

  const emptyState = !lessons.length
  // Prefer the 2nd-person student greeting (purpose-built, render full).
  // Fall back to legacy teacher-voice topicHighlights / lessonSummary
  // (slice for length so the dry summary doesn't dominate the hero).
  const studentGreeting = latestAnalysis?.studentGreeting
  const greetingFallback = latestAnalysis?.topicHighlights || latestAnalysis?.lessonSummary
  const greeting = studentGreeting || greetingFallback

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto',
      padding: isMobile ? '24px 18px 80px' : '40px 32px 80px' }}>

      <div style={{ marginBottom: isMobile ? 36 : 48 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.28em',
          textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 14,
          display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.brand,
            boxShadow: `0 0 10px ${T.brand}` }}/>
          {t('dashboard.kickerLessons', { count: lessons.length })}
        </div>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 600,
          fontSize: isMobile ? 40 : 64, lineHeight: 1.05, letterSpacing: '-0.03em',
          margin: 0, color: T.text }}>
          {t('dashboard.welcomeBackComma')}{' '}
          <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{firstName}</span>.
        </h1>
        {emptyState ? (
          <p style={{ marginTop: 20, fontSize: 17, color: T.textDim, lineHeight: 1.55 }}>
            {t('dashboard.empty.firstLesson')}
          </p>
        ) : greeting ? (
          <ExpandableSummary text={String(studentGreeting || greeting)} T={T}
            preferShort t={t}/>
        ) : null}
      </div>

      {/* The "right now" row — what a student actually needs when they log in:
          join the next lesson, revise the last one, reread its analysis. */}
      <div style={{ display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
        gap: 20, marginBottom: 32 }}>
        <UpcomingLessonCard upcoming={upcomingLesson} slug={slug} basePath={basePath}/>

        <ReviseCard lesson={lessons[0]} slug={slug} basePath={basePath}/>

        <LatestLessonCard lesson={lessons[0]} slug={slug} basePath={basePath}/>
      </div>

      {/* Everything analytical lives behind one calm disclosure — full detail
          on demand, zero noise by default. The closed header still whispers
          the headline numbers so nothing feels hidden. */}
      {!emptyState && (
        <div style={{ marginBottom: 32 }}>
          <button type="button" onClick={() => setProgressOpen(o => !o)}
            aria-expanded={progressOpen}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer',
              background: 'transparent', border: `1px solid ${T.border}`,
              borderRadius: 18, padding: '16px 20px', color: T.text,
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="material-symbols-outlined"
              style={{ fontSize: 20, color: T.brand }}>monitoring</span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: T.text }}>
                {t('dashboard.progress.show')}
              </div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                {t('dashboard.progress.hint')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: FONT.display, fontSize: 26, fontWeight: 600,
                background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {composite}
              </span>
              <Pill tone="brand" size="sm">{cefr}</Pill>
              <span className="material-symbols-outlined"
                style={{ fontSize: 22, color: T.textDim,
                  transform: progressOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 220ms ease' }}>expand_more</span>
            </div>
          </button>

          {progressOpen && (
            <div style={{ marginTop: 16 }}>
              <Glass padding={28} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.28em',
                  textTransform: 'uppercase', color: T.textDim, marginBottom: 12 }}>
                  {t('dashboard.composite.label')}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: FONT.display, fontSize: 96, fontWeight: 600,
                    lineHeight: 1, letterSpacing: '-0.04em',
                    background: G.brand, WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {composite}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim }}>{t('dashboard.composite.outOf')}</div>
                </div>
                <div style={{ marginTop: 24, display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <StatTile label={t('dashboard.stat.lessons')} value={data?.lessonCount ?? 0} icon="school"/>
                  <StatTile label={t('dashboard.stat.keywords')} value={data?.keywordCount ?? 0} icon="menu_book"/>
                  <StatTile label={t('dashboard.stat.cefr')} value={cefr} icon="trending_up"/>
                </div>
              </Glass>

              {metricScores ? (
                <div style={{ display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)',
                  gap: 12 }}>
                  {METRICS.map(axis => (
                    <MetricCard key={axis.k} axis={axis}
                      score={numberOr(metricScores[axis.k], 0)}
                      slug={slug} basePath={basePath}/>
                  ))}
                </div>
              ) : (
                <Glass padding={20} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: T.textDim, letterSpacing: '0.08em' }}>
                    {t('dashboard.metric.empty')}
                  </div>
                </Glass>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <RecentLessons lessons={lessons} slug={slug} basePath={basePath}/>
      </div>
    </div>
  )
}
