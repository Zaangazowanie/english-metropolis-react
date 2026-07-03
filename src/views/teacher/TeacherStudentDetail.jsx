// TeacherStudentDetail — read-only analyses for ONE of the teacher's students
// (P2, slice 5). BRIEF P2: "My Students (roster w/ links to a teacher-scoped
// student view: analyses read-only, keywords editable)" — this is that view.
//
// Data seam: GET /api/console/teacher/student?student_slug= — a PROPOSED
// endpoint (console-backend-gap issue #149, not yet in API-CONTRACT.md).
// Teacher magic-link tokens cannot call the admin Convex queries that power
// /admin/student/:slug, and convex/** is off-limits to the fleet, so the
// analyses must arrive through the console seam. Field names mirror what the
// admin already renders (students:getStudentDashboard / getStudentLevelHistory):
//   student:{slug,name,level,targetLevel?,group?}
//   analyses:[{lesson_id, date, title, cefrBand, overallScore,
//              vocabularyRange, grammaticalAccuracy, fluencyAndCoherence,
//              pronunciation, communicativeEffectiveness, lessonSummary,
//              strengths[], improvements[], keyErrors[], practiceAdvice[]}]
//   level_history:[{timestamp, from, to}]
// Scoping is SERVER-side (403 for students who aren't this teacher's own).
// Until the endpoint flips live: the labelled "backend not live yet" panel —
// nothing on this screen is ever mocked (KICKOFF.md rule 4).
//
// Everything here is READ-ONLY by design; the one edit affordance is a
// hand-off link into the Keywords tab (?student= preselect). Charts and
// prose formatting reuse the shared analytics primitives (KICKOFF rule 6).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { getTeacherStudentDetail } from './consoleApi.js'
import { BackendNotLive, LevelChip, SectionError, SectionLoading } from './TeacherPanels.jsx'
import {
  CefrBadge,
  METRICS,
  MetricLineChart,
  MetricRadarChart,
  RichInline,
  RichText,
  formatDate,
  scoreToTier,
} from '../../components/analytics/AnalyticsPrimitives.jsx'

// Pseudo-metric so the overall score can ride the shared longitudinal chart.
const OVERALL_METRIC = {
  key: 'overallScore',
  label: 'Overall Score',
  shortLabel: 'Overall',
  icon: 'insights',
  hue: { stroke: '#0284c7', fill: 'rgba(2, 132, 199, 0.08)' },
}

// Compact read-only score bar (tier colours from the shared scoreToTier).
function MetricBar({ metric, value, delta }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0))
  const tier = scoreToTier(pct)
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="material-symbols-outlined text-sm text-slate-400" aria-hidden>{metric.icon}</span>
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{metric.shortLabel}</span>
        <span className="ml-auto font-headline text-lg text-slate-900 tabular-nums">{Math.round(pct)}</span>
        <span className={`text-[10px] font-label font-bold uppercase tracking-[0.1em] ${tier.color}`}>{tier.label}</span>
        {delta != null && Math.abs(delta) >= 1 && (
          <span className={`text-[11px] font-bold tabular-nums ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {delta >= 0 ? '↑' : '↓'}{Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${tier.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Literal Tailwind class sets per tone (JIT-safe — never composed at runtime).
const FACT_TONES = {
  emerald: { box: 'border-emerald-200 bg-emerald-50/60', icon: 'text-emerald-500', title: 'text-emerald-900' },
  amber: { box: 'border-amber-200 bg-amber-50/60', icon: 'text-amber-500', title: 'text-amber-900' },
  rose: { box: 'border-rose-200 bg-rose-50/50', icon: 'text-rose-400', title: 'text-rose-900' },
  sky: { box: 'border-sky-200 bg-sky-50/60', icon: 'text-sky-500', title: 'text-sky-900' },
}

function FactList({ tone, icon, title, items }) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean)
  if (!list.length) return null
  const t = FACT_TONES[tone] || FACT_TONES.sky
  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 ${t.box}`}>
      <p className={`flex items-center gap-1.5 font-label text-[10px] font-bold uppercase tracking-[0.18em] ${t.title}`}>
        <span className={`material-symbols-outlined text-sm ${t.icon}`} aria-hidden>{icon}</span>
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
            <span className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${t.icon.replace('text-', 'bg-')}`} aria-hidden />
            <span><RichInline text={item} /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// One analysis = one expandable card (latest is expanded by default).
function AnalysisCard({ analysis, expanded, onToggle }) {
  return (
    <div className="rounded-[1.25rem] border border-white/70 bg-white/80 transition hover:border-sky-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <span className="material-symbols-outlined text-lg text-slate-400" aria-hidden>
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
        <span className="font-label text-xs font-bold text-slate-400 tabular-nums shrink-0">
          {analysis.lessonDate ? formatDate(analysis.lessonDate) : 'Undated'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{analysis.lessonTitle}</span>
        <CefrBadge band={analysis.cefrBand} score={analysis.overallScore} />
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4 sm:px-6">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {METRICS.map(m => (
              <MetricBar key={m.key} metric={m} value={analysis[m.key]} />
            ))}
          </div>

          {analysis.lessonSummary && (
            <div>
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Lesson summary</p>
              <RichText text={analysis.lessonSummary} className="mt-2" />
            </div>
          )}

          <FactList tone="emerald" icon="thumb_up" title="Strengths" items={analysis.strengths} />
          <FactList tone="amber" icon="trending_up" title="Areas to improve" items={analysis.improvements} />
          <FactList tone="rose" icon="error" title="Key errors" items={analysis.keyErrors} />
          <FactList tone="sky" icon="tips_and_updates" title="Practice advice" items={analysis.practiceAdvice} />
        </div>
      )}
    </div>
  )
}

export default function TeacherStudentDetail() {
  const { slug: rawSlug } = useParams()
  const slug = String(rawSlug || '').trim()
  const { studentBySlug } = useOutletContext()
  const rosterEntry = studentBySlug?.[slug]

  const [state, setState] = useState({ loading: true, error: null, data: null })
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await getTeacherStudentDetail({ studentSlug: slug })
      setState({ loading: false, error: null, data })
    } catch (err) {
      setState({ loading: false, error: err, data: null })
    }
  }, [slug])
  useEffect(() => { load() }, [load])

  // Header identity: endpoint data → roster entry (/me) → the slug itself.
  const student = state.data?.student || rosterEntry || { slug }

  // Join-shape parity with the admin view: charts/cards read lessonDate +
  // lessonTitle, the endpoint sends date + title. Newest first.
  const enriched = useMemo(() => {
    const rows = Array.isArray(state.data?.analyses) ? state.data.analyses : []
    return rows
      .map((a, i) => ({
        ...a,
        lessonDate: a.date || null,
        lessonTitle: a.title || 'Lesson',
        _key: String(a.lesson_id || `${a.date || 'undated'}-${i}`),
      }))
      .sort((x, y) => String(y.lessonDate || '').localeCompare(String(x.lessonDate || '')))
  }, [state.data])

  const latest = enriched[0] || null
  const previous = enriched[1] || null
  const dated = useMemo(() => enriched.filter(a => a.lessonDate), [enriched])
  const history = Array.isArray(state.data?.level_history) ? state.data.level_history : []

  const [metricKey, setMetricKey] = useState('overallScore')
  const activeMetric = metricKey === 'overallScore' ? OVERALL_METRIC : (METRICS.find(m => m.key === metricKey) || OVERALL_METRIC)

  const [expanded, setExpanded] = useState(() => new Set())
  useEffect(() => {
    setExpanded(enriched.length ? new Set([enriched[0]._key]) : new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data])
  const toggle = (key) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const deltaFor = (key) => (latest && previous ? (Number(latest[key]) || 0) - (Number(previous[key]) || 0) : null)

  const body = () => {
    if (state.loading) return <SectionLoading />
    if (state.error?.kind === 'not-live') {
      return (
        <BackendNotLive
          endpoint="GET /api/console/teacher/student"
          note="This endpoint is proposed in console-backend-gap issue #149 (it isn't in the contract yet) — Ricky implements it on the VPS, and this page fills in with real analyses the moment it flips live."
        />
      )
    }
    if (state.error) return <SectionError error={state.error} onRetry={load} />
    if (!enriched.length) {
      return (
        <div className="rounded-[1.25rem] border border-dashed border-sky-300 bg-white/60 px-5 py-4 text-sm leading-relaxed text-slate-600">
          No analyses for {student?.name || student?.slug || 'this student'} yet. Analyses are generated when a
          finished lesson or transcript is ingested — you can{' '}
          <Link to="/teacher/upload" className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-800">
            upload one from the Upload tab
          </Link>.
        </div>
      )
    }
    return (
      <div className="space-y-6">
        {/* ── Latest assessment: radar + per-skill bars ── */}
        <div className="grid gap-6 md:grid-cols-5">
          <div className="md:col-span-2">
            <MetricRadarChart scores={latest} onMetricClick={m => setMetricKey(m.key)} />
          </div>
          <div className="md:col-span-3">
            <div className="flex flex-wrap items-center gap-3">
              <CefrBadge band={latest.cefrBand} score={latest.overallScore} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{latest.lessonTitle}</p>
                <p className="text-xs text-slate-400">
                  Latest assessment{latest.lessonDate ? ` · ${formatDate(latest.lessonDate)}` : ''}
                  {previous ? ' · deltas vs previous lesson' : ''}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {METRICS.map(m => (
                <MetricBar key={m.key} metric={m} value={latest[m.key]} delta={deltaFor(m.key)} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Progress over time ── */}
        {dated.length >= 2 && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Progress over time</p>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {[OVERALL_METRIC, ...METRICS].map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetricKey(m.key)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      metricKey === m.key
                        ? 'border-sky-300 bg-white text-sky-700 shadow-[0_10px_22px_-18px_rgba(2,132,199,0.8)]'
                        : 'border-slate-200 bg-white/60 text-slate-500 hover:border-sky-200 hover:text-sky-600'
                    }`}
                  >
                    {m.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <MetricLineChart metric={activeMetric} analyses={dated} />
            </div>
          </div>
        )}

        {/* ── Level history ── */}
        {history.length > 0 && (
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Level history</p>
            <div className="mt-2 space-y-2">
              {history.map((h, i) => (
                <div key={h?._id || i} className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/70 bg-white/80 px-4 py-2.5">
                  <span className="font-label text-xs font-bold text-slate-400 tabular-nums">{formatDate(h?.timestamp)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <CefrBadge band={h?.from || '—'} />
                    <span className="font-bold text-emerald-600" aria-hidden>→</span>
                    <CefrBadge band={h?.to || '—'} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── All analyses, newest first ── */}
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            All analyses
            <span className="ml-2 font-sans text-xs font-semibold normal-case tracking-normal text-slate-400">{enriched.length}</span>
          </p>
          <div className="mt-2 space-y-2">
            {enriched.map(a => (
              <AnalysisCard key={a._key} analysis={a} expanded={expanded.has(a._key)} onToggle={() => toggle(a._key)} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
      <Link
        to="/teacher/students"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-sky-700"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden>arrow_back</span>
        My Students
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Student</p>
          <h2 className="mt-1 truncate font-headline text-3xl text-slate-900">
            {student?.name || student?.slug || 'Student'}<span className="italic text-sky-600">.</span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {student?.slug && <span className="text-xs text-slate-400">{student.slug}</span>}
            <LevelChip level={student?.level} />
            {student?.targetLevel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                <span className="material-symbols-outlined text-sm" aria-hidden>flag</span>
                target {String(student.targetLevel).toUpperCase()}
              </span>
            )}
            {student?.group && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                <span className="material-symbols-outlined text-sm" aria-hidden>workspaces</span>
                {student.group}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500"
            title="Analyses are learned from lessons — they can be read here but not edited."
          >
            <span className="material-symbols-outlined text-sm" aria-hidden>visibility</span>
            Read-only
          </span>
          <Link
            to={`/teacher/keywords?student=${encodeURIComponent(slug)}`}
            className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden>translate</span>
            Edit keywords
          </Link>
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
        Every recorded analysis for this student — CEFR band, skill scores and the examiner-style
        commentary — exactly as the school sees them. Scoped to you on the server.
      </p>

      <div className="mt-5">{body()}</div>
    </section>
  )
}
