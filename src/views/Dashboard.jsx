import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import {
  METRICS,
  scoreToTier,
  formatDate,
  CefrBadge,
  RichText,
  RichInline,
  MetricRadarChart,
  MetricLineChart,
  Modal,
  parseMetricCommentary,
} from '../components/analytics/AnalyticsPrimitives.jsx'

/* ============================================================================
   Helpers — warm copy tailored for students
   ============================================================================ */

function buildWarmGreetingBody(t, count) {
  if (!count) return t('dashboard.greeting.empty')
  if (count === 1) return t('dashboard.greeting.one')
  if (count < 5) return t('dashboard.greeting.few', { count })
  if (count < 10) return t('dashboard.greeting.some', { count })
  return t('dashboard.greeting.many', { count })
}

function buildEncouragement(t, latest, avgOverall) {
  if (!latest) return []
  const lines = []
  const score = Math.round(latest.overallScore || 0)
  if (score >= 80) lines.push(t('dashboard.encouragement.advanced', { score }))
  else if (score >= 70) lines.push(t('dashboard.encouragement.consolidating', { score, band: latest.cefrBand || 'C1' }))
  else if (score >= 60) lines.push(t('dashboard.encouragement.solid', { score }))
  else lines.push(t('dashboard.encouragement.stronger', { score }))
  if (avgOverall && Math.abs(score - avgOverall) >= 4) {
    if (score > avgOverall) lines.push(t('dashboard.encouragement.above', { diff: score - avgOverall }))
    else lines.push(t('dashboard.encouragement.below', { avg: avgOverall }))
  }
  return lines
}

/* ============================================================================
   Accordion — warm collapsible
   ============================================================================ */

function Accordion({ title, subtitle, icon, badge, children, defaultOpen = false, tone = 'sky' }) {
  const [open, setOpen] = useState(defaultOpen)
  const tones = {
    sky: 'from-sky-50/80 to-blue-50/60 border-sky-100',
    violet: 'from-violet-50/70 to-fuchsia-50/60 border-violet-100',
    emerald: 'from-emerald-50/70 to-teal-50/60 border-emerald-100',
    amber: 'from-amber-50/70 to-orange-50/60 border-amber-100',
  }
  return (
    <div className={`rounded-[1.5rem] border bg-gradient-to-br ${tones[tone] || tones.sky} editorial-shadow overflow-hidden transition-all duration-300`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-white/30 transition"
      >
        <div className="flex items-center gap-3 text-left">
          <span className="material-symbols-outlined text-xl text-sky-600">{icon}</span>
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-slate-700">{title}</p>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {badge != null && (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-label font-bold text-sky-700 border border-sky-200">{badge}</span>
          )}
        </div>
        <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && (
        <div className="border-t border-white/60 bg-white/50 px-5 py-4">{children}</div>
      )}
    </div>
  )
}

/* ============================================================================
   Main Dashboard
   ============================================================================ */

export default function Dashboard({ data }) {
  const { t } = useI18n()
  const [selectedMetric, setSelectedMetric] = useState(null)
  const navigate = useNavigate()

  const profile = data?.profile || {}
  const slug = profile?.slug || ''
  const lessons = data?.lessons || []
  const analyses = data?.analyses || []
  const keywords = data?.keywords || []

  const assessment = useMemo(() => {
    if (!analyses.length) return null
    const latest = analyses[0]
    const prev = analyses.length > 1 ? analyses[1] : null
    const avg = (field) => {
      const vals = analyses.map(a => Number(a[field]) || 0).filter(v => v > 0)
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    }
    const result = {
      cefrBand: latest?.cefrBand || profile.level || 'N/A',
      overallScore: latest?.overallScore || 0,
      avgOverall: avg('overallScore'),
      assessmentCount: analyses.length,
      delta: prev ? Math.round((latest.overallScore || 0) - (prev.overallScore || 0)) : null,
      deltas: {},
    }
    for (const m of METRICS) {
      result[m.key] = latest?.[m.key] || 0
      result[`avg${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`] = avg(m.key)
      result.deltas[m.key] = prev ? Math.round((latest?.[m.key] || 0) - (prev?.[m.key] || 0)) : null
    }
    return result
  }, [analyses, profile.level])

  const latestAnalysis = analyses[0] || null

  const recurring = useMemo(() => {
    if (!analyses.length) return { strengths: [], improvements: [] }
    const collectedStrengths = analyses.flatMap(a => a.strengths || [])
    const collectedImprovements = analyses.flatMap(a => a.improvements || [])
    const dedupe = (list) => {
      const map = new Map()
      list.forEach(entry => {
        const key = String(entry || '').trim()
        if (!key) return
        map.set(key, (map.get(key) || 0) + 1)
      })
      return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([text, count]) => ({ text, count }))
    }
    return {
      strengths: dedupe(collectedStrengths),
      improvements: dedupe(collectedImprovements),
    }
  }, [analyses])

  const firstName = profile.firstName || String(profile.name || t('dashboard.studentFallback')).split(' ')[0]
  const warmGreetingBody = buildWarmGreetingBody(t, lessons.length)
  const encouragement = buildEncouragement(t, latestAnalysis, assessment?.avgOverall)

  if (data?.loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-[1.75rem] bg-slate-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4" id="page-dashboard">
      {/* Hero — warm greeting */}
      <section className="rounded-[1.75rem] bg-gradient-to-br from-white via-sky-50/50 to-indigo-50/60 border border-white/70 editorial-shadow px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">{t('dashboard.kicker')}</p>
            <h1 className="mt-1.5 font-headline text-2xl sm:text-3xl text-slate-900 tracking-tight">
              {t('dashboard.welcomeBackComma')}<span className="text-sky-700"> {firstName}</span>
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
              {warmGreetingBody}
            </p>
            {encouragement.length > 0 && (
              <div className="mt-3 space-y-1">
                {encouragement.map((line, i) => (
                  <p key={i} className="text-sm text-slate-700"><span className="text-sky-600">•</span> <RichInline text={line} /></p>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="rounded-[1rem] bg-white/70 backdrop-blur border border-white/80 px-4 py-3 text-center min-w-[84px]">
              <p className="text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-500">{t('dashboard.stat.lessons')}</p>
              <p className="mt-1 font-headline text-2xl text-slate-900">{lessons.length}</p>
            </div>
            <div className="rounded-[1rem] bg-white/70 backdrop-blur border border-white/80 px-4 py-3 text-center min-w-[84px]">
              <p className="text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-500">{t('dashboard.stat.keywords')}</p>
              <p className="mt-1 font-headline text-2xl text-slate-900">{keywords.length}</p>
            </div>
            <div className="rounded-[1rem] bg-gradient-to-br from-emerald-50 to-sky-50 border border-emerald-200 px-4 py-3 text-center min-w-[84px]">
              <p className="text-[11px] font-label font-bold uppercase tracking-[0.18em] text-slate-500">{t('dashboard.stat.level')}</p>
              <p className="mt-1 font-headline text-2xl text-emerald-700">{assessment?.cefrBand || profile.level || '—'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Latest Lesson Feedback — moved ABOVE the radar so it's the focal point */}
      {latestAnalysis && (
        <Accordion
          title={t('dashboard.latest.title')}
          subtitle={`${formatDate(latestAnalysis.date)} · ${latestAnalysis.lessonTitle || t('dashboard.latest.subtitleFallback')}`}
          icon="auto_stories"
          badge={latestAnalysis.cefrBand}
          defaultOpen={true}
          tone="sky"
        >
          <LessonFeedbackBlock
            analysis={latestAnalysis}
            slug={slug}
            onOpenLesson={() => navigate(`/app/${slug}/lessons?lessonId=${encodeURIComponent(String(latestAnalysis._id || latestAnalysis.id || latestAnalysis.date || ''))}`)}
          />
        </Accordion>
      )}

      {/* Overall Assessment — radar + pills */}
      {assessment && (
        <section className="rounded-[1.75rem] bg-white/80 border border-white/80 editorial-shadow px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">{t('dashboard.cefr.kicker')}</p>
              <h2 className="mt-1 font-headline text-xl text-slate-900">{t('dashboard.cefr.title')}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">{t('dashboard.cefr.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <CefrBadge band={assessment.cefrBand} score={assessment.overallScore} size="lg" />
              {assessment.delta != null && Math.abs(assessment.delta) >= 1 && (
                <span className={`text-xs font-bold ${assessment.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {assessment.delta >= 0 ? '↑' : '↓'}{Math.abs(assessment.delta)} {t('dashboard.cefr.vsLast')}
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-[minmax(0,280px),minmax(0,1fr)] items-center">
            <div className="w-full max-w-[280px] mx-auto">
              <MetricRadarChart
                scores={assessment}
                size={280}
                onMetricClick={(m) => setSelectedMetric({ metric: m, scope: 'overall' })}
              />
            </div>
            <div className="space-y-2">
              {METRICS.map((m, i) => {
                const val = assessment[m.key] || 0
                const tier = scoreToTier(val)
                const delta = assessment.deltas[m.key]
                // Metric → practice category cross-link
                const practiceCategory = (
                  m.key === 'grammaticalAccuracy' ? 'grammar' :
                  m.key === 'vocabularyRange' ? 'vocabulary' :
                  m.key === 'pronunciation' ? 'pronunciation' :
                  m.key === 'fluencyAndCoherence' ? 'fluency' :
                  m.key === 'communicativeEffectiveness' ? 'fluency' : 'grammar'
                )
                return (
                  <div
                    key={m.key}
                    className="group relative w-full rounded-[1.25rem] bg-white border border-slate-200/70 px-4 py-3 hover:border-sky-300 hover:shadow-md transition-all metric-card-enter"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedMetric({ metric: m, scope: 'overall' })}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-base shrink-0" style={{ color: m.hue.stroke }}>{m.icon}</span>
                          <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700 truncate">{m.shortLabel}</p>
                        </div>
                        <div className="flex items-baseline gap-2 shrink-0">
                          <span className="font-headline text-lg text-slate-900 tabular-nums">{Math.round(val)}</span>
                          <span className={`text-[9px] font-label font-bold uppercase tracking-[0.1em] ${tier.color}`}>{tier.label}</span>
                          {delta != null && Math.abs(delta) >= 1 && (
                            <span className={`text-[10px] font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {delta >= 0 ? '↑' : '↓'}{Math.abs(delta)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-1 rounded-full ${tier.bar} metric-bar-fill`}
                          style={{ '--target-width': `${val}%`, animationDelay: `${i * 80 + 200}ms` }}
                        />
                      </div>
                    </button>
                    {/* Onion quick-links — deep dive (primary) + practice (secondary) */}
                    <div className="mt-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedMetric({ metric: m, scope: 'overall' }) }}
                        className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-2.5 py-1 text-[9px] font-label font-bold uppercase tracking-[0.12em] text-white cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[11px]">analytics</span>
                        {t('dashboard.cefr.diveInto', { label: m.shortLabel })}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); navigate(`/app/${slug}/practice?category=${practiceCategory}`) }}
                        className="inline-flex items-center gap-1 rounded-full bg-white border border-violet-200 hover:border-violet-400 px-2.5 py-1 text-[9px] font-label font-bold uppercase tracking-[0.12em] text-violet-700 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[11px]">play_arrow</span>
                        {t('dashboard.cefr.drill', { label: m.shortLabel })}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); navigate(`/app/${slug}/lessons`) }}
                        className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 hover:border-slate-400 px-2.5 py-1 text-[9px] font-label font-bold uppercase tracking-[0.12em] text-slate-600 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[11px]">menu_book</span>
                        {t('dashboard.cefr.inLessons')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Recurring Patterns — block grid with cross-links */}
      {(recurring.strengths.length > 0 || recurring.improvements.length > 0) && (
        <Accordion
          title={t('dashboard.recurring.title')}
          subtitle={t('dashboard.recurring.subtitle')}
          icon="insights"
          badge={t('dashboard.recurring.badge', { count: recurring.strengths.length + recurring.improvements.length })}
          tone="violet"
        >
          <RecurringPatternsBlock recurring={recurring} slug={slug} />
        </Accordion>
      )}

      {/* Progress Over Time */}
      {analyses.length > 1 && (
        <Accordion
          title={t('dashboard.progress.title')}
          subtitle={t('dashboard.progress.subtitle')}
          icon="trending_up"
          badge={t('dashboard.progress.badge', { count: analyses.length })}
          tone="emerald"
        >
          <div className="grid gap-5 lg:grid-cols-2">
            {METRICS.map(m => (
              // NOTE: This is a <div>, not a <button>. Nesting an interactive SVG
              // chart inside a <button> made the inner node clicks unreachable in
              // some browsers (HTML forbids nested interactive elements). The chart
              // header below is a separate button; individual SVG nodes handle their
              // own clicks via onPointClick.
              <div
                key={m.key}
                className="rounded-[1.25rem] border border-slate-200/60 bg-white/80 px-4 py-3 text-left hover:border-sky-300 hover:shadow-sm transition cursor-pointer"
                onClick={() => setSelectedMetric({ metric: m, scope: 'overall' })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedMetric({ metric: m, scope: 'overall' }) }}
              >
                <MetricLineChart
                  metric={m}
                  analyses={analyses.map(a => ({ ...a, lessonDate: a.date }))}
                  onPointClick={(p) => setSelectedMetric({ metric: m, scope: 'lesson', analysis: p.analysis })}
                />
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* Recent Lessons — clickable cards, each opens the full analysis */}
      {lessons.length > 0 && (
        <Accordion
          title={t('dashboard.recent.title')}
          subtitle={t('dashboard.recent.subtitle')}
          icon="menu_book"
          badge={`${lessons.length}`}
          tone="amber"
        >
          <div className="grid gap-2.5 md:grid-cols-2">
            {lessons.slice(0, 6).map(lesson => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => navigate(`/app/${slug}/lessons?lessonId=${encodeURIComponent(String(lesson.id || lesson.date || ''))}`)}
                className="group flex items-start justify-between gap-3 rounded-[1.25rem] border border-slate-200/70 bg-white px-4 py-3 text-left hover:border-amber-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{formatDate(lesson.date)}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 truncate">{lesson.title}</p>
                  {lesson.topics?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {lesson.topics.slice(0, 4).map((t, i) => (
                        <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-label text-slate-500">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-label text-slate-400">{t('dashboard.recent.words', { count: lesson.keyword_count || lesson.keywords?.length || 0 })}</span>
                  {lesson.analysis && <CefrBadge band={lesson.analysis.cefrBand} score={lesson.analysis.overallScore} />}
                  <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-label font-bold text-amber-600 opacity-0 group-hover:opacity-100 transition">
                    {t('dashboard.recent.open')}<span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Accordion>
      )}

      {/* Metric Detail Modal */}
      <Modal
        open={!!selectedMetric}
        onClose={() => setSelectedMetric(null)}
        title={selectedMetric ? t('dashboard.modal.title', { label: (selectedMetric.metric || selectedMetric).label }) : ''}
        widthClass="max-w-4xl"
      >
        {selectedMetric && (
          <StudentMetricDetail
            metric={selectedMetric.metric || selectedMetric}
            focusAnalysisId={selectedMetric.analysis?._id || selectedMetric.analysis?.id}
            analyses={analyses}
            assessment={assessment}
            slug={data?.profile?.slug}
          />
        )}
      </Modal>
    </div>
  )
}

/* ============================================================================
   StudentMetricDetail — warm student-facing deep dive
   ============================================================================ */

function StudentMetricDetail({ metric, analyses, assessment, focusAnalysisId, slug }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [highlightedId, setHighlightedId] = useState(null)
  const [selectedPoint, setSelectedPoint] = useState(null)
  const currentVal = assessment?.[metric.key] || 0
  const avgKey = `avg${metric.key.charAt(0).toUpperCase() + metric.key.slice(1)}`
  const avgVal = assessment?.[avgKey] || 0
  const tier = scoreToTier(currentVal)

  const perLessonCommentary = analyses
    .map(a => {
      const commentary = parseMetricCommentary(a)
      return commentary?.[metric.key] ? {
        analysisId: String(a._id || a.id || ''),
        lessonId: String(a.lessonId || ''),
        date: a.date || a.lessonDate,
        title: a.lessonTitle || t('dashboard.detail.lessonFallback'),
        text: commentary[metric.key],
      } : null
    })
    .filter(Boolean)

  // Scroll and highlight when focusAnalysisId provided (from clicking a node)
  useEffect(() => {
    if (!focusAnalysisId) return
    const timer = setTimeout(() => {
      setHighlightedId(focusAnalysisId)
      const el = document.querySelector(`[data-student-commentary="${focusAnalysisId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Also open the details element
        if (el.tagName === 'DETAILS') el.open = true
      }
      setTimeout(() => setHighlightedId(null), 2800)
    }, 100)
    return () => clearTimeout(timer)
  }, [focusAnalysisId])

  function handlePointClick(p) {
    // Show an inline "focus panel" right inside the Deep Dive modal — specific
    // to THIS metric on THIS lesson. No navigation away from the modal. The
    // panel itself has an "Open full lesson" button AND a "Back to all lessons"
    // close button, so the student can drill deeper or zoom back out.
    setSelectedPoint(p.analysis || null)
    // Also highlight the scroll-target if inline commentary exists (bonus).
    const id = String(p.analysis?._id || p.analysis?.id || '')
    if (id) {
      setHighlightedId(id)
      setTimeout(() => setHighlightedId(null), 3200)
    }
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-[1.5rem] border-2 ${tier.border} ${tier.soft} px-5 py-4 flex items-center gap-4 flex-wrap`}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-white shadow-sm">
          <span className="material-symbols-outlined text-2xl" style={{ color: metric.hue.stroke }}>{metric.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-headline text-3xl text-slate-900 tabular-nums">{Math.round(currentVal)}<span className="text-base text-slate-500 font-normal">/100</span></p>
          <p className={`font-label text-xs font-bold uppercase tracking-[0.18em] ${tier.color}`}>{tier.label} · {t('dashboard.detail.rollingAverage', { avg: avgVal })}</p>
        </div>
        <p className="text-[11px] text-slate-500 italic max-w-[240px]">{metric.studentDescription}</p>
      </div>

      {analyses.length > 1 && (
        <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
          <MetricLineChart
            metric={metric}
            analyses={analyses.map(a => ({ ...a, lessonDate: a.date }))}
            onPointClick={handlePointClick}
          />
          <p className="text-[11px] text-slate-400 italic mt-1">{t('dashboard.detail.chartHint', { label: metric.shortLabel })}</p>
        </div>
      )}

      {/* Per-lesson FOCUS PANEL — shows when a node is clicked. Metric-specific
          insight for that lesson, with "Open full lesson" + "Back" controls. */}
      {selectedPoint && (
        <MetricLessonFocusPanel
          metric={metric}
          analysis={selectedPoint}
          slug={slug}
          onClose={() => setSelectedPoint(null)}
        />
      )}

      {perLessonCommentary.length > 0 && (
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 mb-2">
            {t('dashboard.detail.perLessonHeader', { label: metric.shortLabel })}
          </p>
          <div className="space-y-2">
            {perLessonCommentary.map(c => (
              <details
                key={c.analysisId}
                data-student-commentary={c.analysisId}
                className={`rounded-[1.25rem] border border-slate-200 bg-white overflow-hidden transition ${highlightedId === c.analysisId ? 'commentary-highlight' : ''}`}
              >
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/60 transition list-none">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-base">event</span>
                    <p className="text-sm font-semibold text-slate-800">{formatDate(c.date)}</p>
                    <p className="text-xs text-slate-500 truncate">{c.title}</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-sm">expand_more</span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/30 space-y-3">
                  <RichText text={c.text} />
                  <LessonJumpLinks slug={data?.profile?.slug} analysisId={c.analysisId} lessonId={c.lessonId} metric={metric} />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Cross-link footer inside per-lesson commentary — Mike's "over-reference"
 * ethos. Takes the student directly into the full lesson dive with quotes.
 */
function LessonJumpLinks({ slug, analysisId, lessonId, metric }) {
  const { t } = useI18n()
  const target = lessonId || analysisId
  if (!slug || !target) return null
  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
      <a
        href={`/app/${slug}/lessons?lessonId=${encodeURIComponent(target)}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-3 py-1.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-white hover:from-sky-600 hover:to-blue-700 transition cursor-pointer shadow-sm"
      >
        <span className="material-symbols-outlined text-[12px]">open_in_new</span>
        {t('dashboard.jump.openLesson')}
      </a>
      <a
        href={`/app/${slug}/lessons?lessonId=${encodeURIComponent(target)}&metricFocus=${metric.key}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 hover:border-sky-300 px-3 py-1.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-sky-700 transition cursor-pointer"
      >
        <span className="material-symbols-outlined text-[12px]">filter_alt</span>
        {t('dashboard.jump.metricBits', { label: metric.shortLabel })}
      </a>
      <a
        href={`/app/${slug}/knowledge`}
        className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 hover:border-rose-300 px-3 py-1.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-rose-700 transition cursor-pointer"
      >
        <span className="material-symbols-outlined text-[12px]">flag</span>
        {t('dashboard.jump.errorLibrary')}
      </a>
    </div>
  )
}

/* ============================================================================
   MetricLessonFocusPanel — the per-node drill-down inside the metric deep-dive.
   When a student clicks a node on a metric line chart, this panel slides in
   directly below the chart, showing THIS metric's story for THIS lesson:
   score + delta, filtered strengths/improvements/keyErrors that touch this
   metric, the session summary excerpt, and onion controls ("Open full lesson"
   vs "Back to all lessons on this chart"). No navigation away from the modal
   unless the student explicitly asks for it.
   ============================================================================ */

function filterItemsByMetric(items, metric) {
  if (!items || !items.length) return []
  const key = metric.key.toLowerCase()
  const short = metric.shortLabel.toLowerCase()
  const keywordSets = {
    grammaticalaccuracy: ['grammar', 'tense', 'article', 'preposition', 'conditional', 'passive', 'relative', 'clause', 'aspect', 'subject', 'verb', 'agreement', 'gerund', 'infinitive', 'modal', 'reported', 'syntax'],
    vocabularyrange: ['vocabulary', 'word', 'lexis', 'lexical', 'collocation', 'register', 'idiom', 'phrasal', 'nuance', 'synonym'],
    pronunciation: ['pronunciation', 'sound', 'stress', 'intonation', 'phoneme', '/θ/', '/ð/', '/v/', 'schwa', 'vowel', 'consonant', 'rhythm', 'ipa'],
    fluencyandcoherence: ['fluency', 'coherence', 'hesitat', 'filler', 'pause', 'self-repair', 'discourse', 'marker', 'flow', 'coherent'],
    communicativeeffectiveness: ['communicat', 'effective', 'clarity', 'register', 'audience', 'pragmatic', 'politeness', 'directness', 'persuas'],
  }
  const kws = keywordSets[key] || keywordSets[key.replace(/[^a-z]/g, '')] || [short]
  const match = (text) => {
    if (!text) return false
    const t = String(text).toLowerCase()
    return kws.some(k => t.includes(k))
  }
  return items.filter(it => {
    if (typeof it === 'string') return match(it)
    if (typeof it === 'object') {
      return match(it.error) || match(it.correction) || match(it.category) || match(it.text)
    }
    return false
  })
}

function MetricLessonFocusPanel({ metric, analysis, slug, onClose }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  if (!analysis) return null

  const val = Math.round(Number(analysis[metric.key]) || 0)
  const tier = scoreToTier(val)
  const lessonDate = analysis.date || analysis.lessonDate || ''
  const lessonTitle = analysis.lessonTitle || t('dashboard.focus.fallbackTitle')
  const lessonId = analysis.lessonId || analysis._id || analysis.id || ''

  // Try to get metric-specific commentary if parseable from personalDetails
  const commentary = parseMetricCommentary(analysis || {})
  const metricSpecific = commentary?.[metric.key]

  // Filter the lesson's strengths/improvements/keyErrors to just the ones
  // that plausibly relate to this metric.
  const strengths = filterItemsByMetric(analysis.strengths, metric)
  const improvements = filterItemsByMetric(analysis.improvements, metric)
  const keyErrors = filterItemsByMetric(analysis.keyErrors, metric)

  // Short lesson summary excerpt — first 2 sentences
  const summary = String(analysis.lessonSummary || '').trim()
  const summaryExcerpt = (summary.match(/[^.!?]+[.!?]+\s*/g) || [summary]).slice(0, 2).join(' ').trim()

  return (
    <div
      className="rounded-[1.5rem] border-2 bg-gradient-to-br from-white to-slate-50 shadow-md overflow-hidden focus-panel-enter"
      style={{ borderColor: metric.hue.stroke + '55' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-br" style={{ backgroundImage: `linear-gradient(135deg, ${metric.hue.stroke}12, #ffffff)` }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-base" style={{ color: metric.hue.stroke }}>{metric.icon}</span>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {t('dashboard.focus.kicker', { label: metric.shortLabel })}
            </p>
          </div>
          <h3 className="mt-1 font-headline text-base text-slate-900 leading-tight">
            {lessonTitle}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(lessonDate)}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="font-headline text-2xl text-slate-900 tabular-nums leading-none">{val}<span className="text-xs text-slate-400 font-normal">/100</span></p>
            <p className={`mt-1 text-[9px] font-label font-bold uppercase tracking-[0.12em] ${tier.color}`}>{tier.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-white border border-slate-200 hover:border-slate-400 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
            aria-label={t('dashboard.focus.closeAria')}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {metricSpecific && (
          <div className="rounded-[1rem] bg-sky-50/60 border border-sky-100 px-4 py-3">
            <p className="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-sky-700 mb-1">{t('dashboard.focus.commentaryLabel')}</p>
            <RichText text={metricSpecific} />
          </div>
        )}

        {!metricSpecific && summaryExcerpt && (
          <div className="rounded-[1rem] bg-slate-50/60 border border-slate-100 px-4 py-3">
            <p className="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">{t('dashboard.focus.snapshotLabel')}</p>
            <p className="text-sm text-slate-700 leading-relaxed">{summaryExcerpt}</p>
          </div>
        )}

        {strengths.length > 0 && (
          <div>
            <p className="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-700 mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">check_circle</span>
              {t('dashboard.focus.wins', { label: metric.shortLabel })}
              <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.focus.winsHint')}</span>
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {strengths.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => navigate(`/app/${slug}/lessons?lessonId=${encodeURIComponent(String(lessonId))}`)}
                  className="insight-card is-strength is-clickable text-left w-full"
                >
                  <span className="insight-icon"><span className="material-symbols-outlined text-sm">check_circle</span></span>
                  <p className="text-[12.5px] text-slate-700 leading-relaxed"><RichInline text={typeof s === 'string' ? s : s.text} /></p>
                  <span className="insight-practice-btn">
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    {t('dashboard.focus.openSource')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {improvements.length > 0 && (
          <div>
            <p className="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-amber-700 mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">trending_up</span>
              {t('dashboard.focus.targets', { label: metric.shortLabel })}
              <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.focus.targetsHint')}</span>
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {improvements.slice(0, 4).map((s, i) => {
                const txt = typeof s === 'string' ? s : (s?.text || '')
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => navigate(`/app/${slug}/practice?focus=${encodeURIComponent(String(txt).slice(0, 80))}`)}
                    className="insight-card is-improvement is-clickable text-left w-full"
                  >
                    <span className="insight-icon"><span className="material-symbols-outlined text-sm">trending_up</span></span>
                    <p className="text-[12.5px] text-slate-700 leading-relaxed"><RichInline text={txt} /></p>
                    <span className="insight-practice-btn">
                      <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                      {t('dashboard.focus.drillThis')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {keyErrors.length > 0 && (
          <div>
            <p className="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-rose-700 mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">flag</span>
              {t('dashboard.focus.slips', { label: metric.shortLabel })}
              <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.focus.slipsHint')}</span>
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {keyErrors.slice(0, 4).map((err, i) => {
                const cat = (err.category || metric.key || 'grammar').toLowerCase()
                const errText = String(err.error || '').slice(0, 80)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => navigate(`/app/${slug}/practice?category=${encodeURIComponent(cat)}&error=${encodeURIComponent(errText)}`)}
                    className="insight-card is-error is-clickable text-left w-full"
                  >
                    <span className="insight-icon"><span className="material-symbols-outlined text-sm">flag</span></span>
                    <p className="font-mono text-[11px] text-rose-700 italic leading-relaxed">"<RichInline text={err.error} />"</p>
                    {err.correction && <p className="text-[11px] text-emerald-700 mt-1"><span className="font-bold">→</span> <RichInline text={err.correction} /></p>}
                    <span className="insight-practice-btn">
                      <span className="material-symbols-outlined text-[12px]">all_inclusive</span>
                      {t('dashboard.focus.drillSuite')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {strengths.length === 0 && improvements.length === 0 && keyErrors.length === 0 && !metricSpecific && (
          <p className="text-sm text-slate-500 italic">
            {t('dashboard.focus.empty', { label: metric.shortLabel })}
          </p>
        )}
      </div>

      {/* Footer — onion navigation */}
      <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-slate-200 hover:border-slate-400 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-slate-900 transition cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">zoom_out</span>
          {t('dashboard.focus.backToAll', { label: metric.shortLabel })}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/app/${slug}/lessons?lessonId=${encodeURIComponent(String(lessonId))}`)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-white transition cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          {t('dashboard.focus.openFull')}
        </button>
      </div>
    </div>
  )
}

/* ============================================================================
   LessonSummaryOnion — light first impression + progressive disclosure.
   The first paragraph or two of the analysis summary render normally. The
   rest (the technical/clinical bits) is tucked into a <details> block labelled
   "Want the technical breakdown?". Matches Mike's "onion" ethos: light first,
   deeper on demand.
   ============================================================================ */

function LessonSummaryOnion({ summary, lessonRef, onOpenLesson }) {
  const { t } = useI18n()
  const { bullets, deepBullets } = useMemo(() => {
    const txt = String(summary || '').trim()
    if (!txt) return { bullets: [], deepBullets: [] }
    const paragraphs = txt.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
    let lightPart, deepPart
    if (paragraphs.length <= 1) {
      const sentences = txt.match(/[^.!?]+[.!?]+\s*/g) || [txt]
      lightPart = sentences.slice(0, 4).join(' ').trim()
      deepPart  = sentences.slice(4).join(' ').trim()
    } else {
      lightPart = paragraphs[0]
      deepPart  = paragraphs.slice(1).join('\n\n')
    }
    const toBullets = (text, max) => (text.match(/[^.!?]+[.!?]+/g) || [text])
      .map(s => s.trim().replace(/\s+/g, ' '))
      .filter(s => s.length > 4)
      .slice(0, max)
    return { bullets: toBullets(lightPart, 5), deepBullets: toBullets(deepPart, 12) }
  }, [summary])

  return (
    <div className="rounded-[1.25rem] border border-sky-100 bg-gradient-to-br from-sky-50/40 to-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">auto_stories</span>
          {t('dashboard.summary.lightVersion')} · <span className="text-slate-400">{lessonRef}</span>
        </p>
        <button
          type="button"
          onClick={onOpenLesson}
          className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 cursor-pointer"
        >
          {t('dashboard.summary.openFull')}<span className="material-symbols-outlined text-[12px]">arrow_outward</span>
        </button>
      </div>
      {bullets.length > 0 ? (
        <ul className="space-y-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 shrink-0" />
              <span className="flex-1">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <RichText text={summary} />
      )}
      {deepBullets.length > 0 && (
        <details className="mt-4 group/details">
          <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-100 to-sky-100 border border-violet-300 hover:border-violet-500 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-violet-800 transition shadow-sm">
            <span className="material-symbols-outlined text-[15px] group-open/details:rotate-90 transition-transform">chevron_right</span>
            <span className="material-symbols-outlined text-[15px]">science</span>
            {t('dashboard.summary.technical')}
          </summary>
          <div className="mt-4 rounded-[1rem] border-l-4 border-violet-400 bg-gradient-to-br from-violet-50/60 via-sky-50/30 to-white pl-4 pr-3 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-sm text-violet-600">science</span>
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">{t('dashboard.summary.technical')}</p>
            </div>
            <ul className="space-y-2">
              {deepBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-violet-500 to-sky-500 shrink-0" />
                  <span className="flex-1">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  )
}

/* ============================================================================
   LessonFeedbackBlock — block-style insight cards for a single lesson's
   strengths / improvements / key errors. Every card cross-links: strengths
   open the lesson source, improvements launch a focused Practice Arena drill,
   errors launch the Error Library / 9-type drill suite. This is the "onion":
   every block offers a drill-down AND a step-back to the full lesson.
   ============================================================================ */

function LessonFeedbackBlock({ analysis, slug, onOpenLesson }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('summary')
  const [expanded, setExpanded] = useState(false)
  if (!analysis) return null
  const strengths = (analysis.strengths || []).filter(Boolean)
  const improvements = (analysis.improvements || []).filter(Boolean)
  const keyErrors = (analysis.keyErrors || []).filter(Boolean)

  const lessonRef = `${formatDate(analysis.date)} · ${analysis.lessonTitle || t('dashboard.feedback.fallbackSession')}`
  const lessonHref = `/app/${slug}/lessons?lessonId=${encodeURIComponent(String(analysis._id || analysis.id || analysis.date || ''))}`

  const TABS = [
    {
      key: 'summary',
      icon: 'auto_stories',
      tone: 'sky',
      label: t('dashboard.feedback.tab.summaryLabel'),
      teaser: t('dashboard.feedback.tab.summaryTeaser'),
      count: null,
    },
    {
      key: 'nailed',
      icon: 'celebration',
      tone: 'emerald',
      label: t('dashboard.feedback.nailed'),
      teaser: t('dashboard.feedback.tab.nailedTeaser', { count: strengths.length }),
      count: strengths.length,
    },
    {
      key: 'missed',
      icon: 'rocket_launch',
      tone: 'amber',
      label: t('dashboard.feedback.tab.missedLabel'),
      teaser: t('dashboard.feedback.tab.missedTeaser', { count: improvements.length + keyErrors.length }),
      count: improvements.length + keyErrors.length,
    },
  ]

  function selectTab(k) {
    if (activeTab === k) setExpanded(e => !e)
    else { setActiveTab(k); setExpanded(true) }
  }

  return (
    <div className="space-y-4">
      {/* Tab strip — three glass pills, each with its own teaser */}
      <div className="grid gap-2 sm:grid-cols-3">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          const isOpen = isActive && expanded
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`lfb-tab lfb-tab-${tab.tone} ${isActive ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                <span className="font-label text-[11px] font-bold uppercase tracking-[0.16em]">{tab.label}</span>
                {tab.count != null && (
                  <span className="ml-auto rounded-full bg-white/70 border border-white/80 px-2 py-0.5 text-[10px] font-bold tabular-nums">{tab.count}</span>
                )}
              </div>
              <p className="text-[11px] leading-snug text-left opacity-80">{tab.teaser}</p>
              <span className="lfb-tab-chev material-symbols-outlined text-[16px]">{isOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
          )
        })}
      </div>

      {/* Expanded tab content — onion detail on demand */}
      {expanded && activeTab === 'summary' && analysis.lessonSummary && (
        <LessonSummaryOnion summary={analysis.lessonSummary} lessonRef={lessonRef} onOpenLesson={onOpenLesson} />
      )}

      {expanded && activeTab === 'nailed' && strengths.length > 0 && (
        <div className="section-block rounded-[1.25rem] p-4">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">celebration</span>
            {t('dashboard.feedback.nailed')}
            <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.feedback.nailedHint')}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {strengths.slice(0, 6).map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={onOpenLesson}
                className="insight-card is-strength is-clickable block text-left w-full"
              >
                <span className="insight-icon">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                </span>
                <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={s} /></p>
                <span className="insight-source-tag">{t('dashboard.feedback.from', { ref: lessonRef })}</span>
                <span className="insight-practice-btn">
                  <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  {t('dashboard.feedback.seeQuote')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {expanded && activeTab === 'missed' && (improvements.length > 0 || keyErrors.length > 0) && (
        <div className="space-y-4">
          {improvements.length > 0 && (
            <div className="section-block rounded-[1.25rem] p-4">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">rocket_launch</span>
                {t('dashboard.feedback.workOn')}
                <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.feedback.workOnHint')}</span>
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {improvements.slice(0, 6).map((s, i) => {
                  const txt = typeof s === 'string' ? s : JSON.stringify(s)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        navigate(`/app/${slug}/practice?focus=${encodeURIComponent(txt.slice(0, 80))}`)
                      }}
                      className="insight-card is-improvement is-clickable block text-left w-full"
                    >
                      <span className="insight-icon">
                        <span className="material-symbols-outlined text-base">trending_up</span>
                      </span>
                      <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={s} /></p>
                      <span className="insight-source-tag">{t('dashboard.feedback.from', { ref: lessonRef })}</span>
                      <span className="insight-practice-btn">
                        <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                        {t('dashboard.feedback.drillArena')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {keyErrors.length > 0 && (
            <div className="section-block rounded-[1.25rem] p-4">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">flag_circle</span>
                {t('dashboard.feedback.keyErrors')}
                <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.feedback.keyErrorsHint')}</span>
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {keyErrors.slice(0, 6).map((err, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault(); e.stopPropagation()
                      const cat = (err.category || 'grammar').toLowerCase()
                      navigate(`/app/${slug}/practice?category=${encodeURIComponent(cat)}&error=${encodeURIComponent(String(err.error || '').slice(0, 80))}`)
                    }}
                    className="insight-card is-error is-clickable block text-left w-full"
                  >
                    <span className="insight-icon">
                      <span className="material-symbols-outlined text-base">flag</span>
                    </span>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="font-mono text-xs text-rose-700 italic leading-relaxed flex-1">"<RichInline text={err.error} />"</p>
                      {err.category && (
                        <span className="shrink-0 rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.12em] text-rose-700">{err.category}</span>
                      )}
                    </div>
                    {err.correction && (
                      <p className="text-xs text-emerald-700 leading-relaxed"><span className="font-bold">→</span> <RichInline text={err.correction} /></p>
                    )}
                    <span className="insight-source-tag">{t('dashboard.feedback.from', { ref: lessonRef })}</span>
                    <span className="insight-practice-btn">
                      <span className="material-symbols-outlined text-[12px]">all_inclusive</span>
                      {t('dashboard.feedback.drillSuite')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onion step-back: back to the overview (scroll to radar) */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
        <button
          type="button"
          onClick={onOpenLesson}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white hover:from-sky-600 hover:to-blue-700 transition cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          {t('dashboard.feedback.openFull')}
        </button>
        <a
          href={lessonHref + '&metricFocus=grammar'}
          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 hover:border-sky-300 px-3 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-sky-700 transition cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">filter_alt</span>
          {t('dashboard.feedback.grammarBits')}
        </a>
        <a
          href="#page-dashboard"
          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 hover:border-slate-400 px-3 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-800 transition cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">zoom_out</span>
          {t('dashboard.feedback.backOverview')}
        </a>
      </div>
    </div>
  )
}

/* ============================================================================
   RecurringPatternsBlock — aggregates strengths/improvements across every
   lesson, with frequency counts and cross-links into the Lessons / Practice / Errors.
   ============================================================================ */

function RecurringPatternsBlock({ recurring, slug }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const topStrengths = recurring.strengths.slice(0, 6)
  const topImprovements = recurring.improvements.slice(0, 6)

  return (
    <div className="space-y-5">
      {topStrengths.length > 0 && (
        <div className="section-block rounded-[1.25rem] p-4">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">star</span>
            {t('dashboard.recurring.consistent')}
            <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.recurring.consistentHint')}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {topStrengths.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigate(`/app/${slug}/lessons`)}
                className="insight-card is-strength is-clickable block text-left w-full"
              >
                <span className="insight-icon">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                </span>
                <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={s.text} /></p>
                <span className="insight-source-tag">{t(s.count === 1 ? 'dashboard.recurring.seenInOne' : 'dashboard.recurring.seenInMany', { count: s.count })}</span>
                <span className="insight-practice-btn">
                  <span className="material-symbols-outlined text-[12px]">menu_book</span>
                  {t('dashboard.recurring.browseLessons')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {topImprovements.length > 0 && (
        <div className="section-block rounded-[1.25rem] p-4">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">flag</span>
            {t('dashboard.recurring.targets')}
            <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">{t('dashboard.recurring.targetsHint')}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {topImprovements.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigate(`/app/${slug}/practice?focus=${encodeURIComponent(String(s.text).slice(0, 80))}`)}
                className="insight-card is-improvement is-clickable block text-left w-full"
              >
                <span className="insight-icon">
                  <span className="material-symbols-outlined text-base">trending_up</span>
                </span>
                <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={s.text} /></p>
                <span className="insight-source-tag">{t(s.count === 1 ? 'dashboard.recurring.flaggedInOne' : 'dashboard.recurring.flaggedInMany', { count: s.count })}</span>
                <span className="insight-practice-btn">
                  <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                  {t('dashboard.feedback.drillArena')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 flex-wrap pt-2">
        <a
          href={`/app/${slug}/knowledge`}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white hover:from-rose-600 hover:to-pink-700 transition cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[14px]">flag</span>
          {t('dashboard.recurring.openErrorLibrary')}
        </a>
        <a
          href={`/app/${slug}/practice`}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.14em] text-white hover:from-violet-600 hover:to-fuchsia-700 transition cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[14px]">sports_esports</span>
          {t('dashboard.recurring.enterArena')}
        </a>
      </div>
    </div>
  )
}
