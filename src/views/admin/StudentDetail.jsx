import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { queryAdminConvex } from '../../contexts/AdminAuthContext.jsx'
import { formatDate, formatLongDate, CefrBadge } from '../../components/analytics/AnalyticsPrimitives.jsx'
import { Avatar, AssignFields, TeacherChip, CourseChip, persistAssignment } from '../../components/admin/AdminKit.jsx'

/* ============================================================================
   Utilities
   ============================================================================ */

function SafeText({ value, fallback = '' }) {
  if (value == null) return fallback
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/* ============================================================================
   RichText — auto-formats clinical analysis prose for readability
   Detects: verbatim quotes, IPA, CEFR bands, lexis lists, key linguistic terms,
   sentence-level semantic shifts (split into paragraphs)
   ============================================================================ */

const LINGUISTIC_KEYWORDS = /\b(present perfect(?: continuous)?|past perfect(?: continuous)?|past simple|past continuous|present simple|present continuous|future perfect|past modals?|past conditional|first conditional|second conditional|third conditional|mixed conditional|conditional|subjunctive|reported speech|passive voice|causative|relative clauses?|defining relative|non-defining relative|phrasal verbs?|collocations?|articles?|definite article|indefinite article|prepositions?|modals?|quasi-modals?|gerunds?|infinitives?|to-infinitive|bare infinitive|participles?|past participle|subject-verb agreement|schwa|IPA|stress pattern|word stress|sentence stress|intonation|rising tone|falling tone|aspect|aspectual|tense|countable|uncountable|mass noun|discourse markers?|fillers?|hedges?|self-repair|register|pragmatics?|pragmatic|productive range|receptive range|C1|C2|B1|B2|A1|A2|CEFR|lexis|lexical|morphology|morphological|syntax|syntactic|phonemic|phonological|pronunciation|fluency|coherence|hesitat[a-z]*|collocat[a-z]*)\b/g

const IPA_PATTERN = /(\/[^\/\n]{1,30}\/)/g
const CEFR_BAND_PATTERN = /\b([ABC][12])\b(?!\s*\()/g
const SCORE_PATTERN = /\b(\d{2,3})\/100\b/g
const ARROW_PATTERN = /\s→\s/g

function splitIntoParagraphs(text) {
  // Split on double newlines first
  if (text.includes('\n\n')) {
    return text.split(/\n\n+/).filter(s => s.trim())
  }
  // If no paragraph breaks, split on semantic boundaries:
  // - After sentences that end with "." + space + capital letter + long enough chunk remaining
  // - But only if the resulting paragraphs would be reasonable (60-400 chars each)
  const sentences = text.match(/[^.!?]+[.!?]+(?:['")]*)?(?:\s|$)/g) || [text]
  if (sentences.length <= 2) return [text]

  // Group sentences into paragraphs of ~2-4 sentences each, aiming for 200-500 char paragraphs
  const paragraphs = []
  let current = ''
  for (const s of sentences) {
    if (current.length + s.length > 450 && current.length > 150) {
      paragraphs.push(current.trim())
      current = s
    } else {
      current += s
    }
  }
  if (current.trim()) paragraphs.push(current.trim())
  return paragraphs.length ? paragraphs : [text]
}

function renderFormattedInline(text, keySeed = 'span') {
  if (!text || typeof text !== 'string') return text
  // We process the text via a sequence of regex replacements that wrap matches
  // in React-renderable markers. We use a placeholder-token approach so the
  // replacements don't clobber each other.
  const tokens = []
  let counter = 0
  const nextToken = (node) => {
    const k = `§§${counter++}§§`
    tokens.push({ key: k, node })
    return k
  }

  let work = text

  // 1) Verbatim double-quoted strings (curly or straight) → italic monospace
  work = work.replace(/"([^"]{2,200})"/g, (m, inner) => nextToken(
    <span className="font-mono italic text-sky-700 bg-sky-50/60 rounded px-1 py-0.5 text-[0.92em]">"{inner}"</span>
  ))
  work = work.replace(/'([^'\n]{2,200})'/g, (m, inner) => nextToken(
    <span className="font-mono italic text-sky-700 bg-sky-50/60 rounded px-1 py-0.5 text-[0.92em]">'{inner}'</span>
  ))

  // 2) IPA /notation/ → mono blue
  work = work.replace(IPA_PATTERN, (m) => nextToken(
    <span className="font-mono text-violet-700 bg-violet-50/60 rounded px-1">{m}</span>
  ))

  // 3) X/100 scores → bold
  work = work.replace(SCORE_PATTERN, (m, n) => nextToken(
    <span className="font-semibold text-slate-800 tabular-nums">{n}/100</span>
  ))

  // 4) CEFR bands (A1-C2) → pill
  work = work.replace(CEFR_BAND_PATTERN, (m, band) => nextToken(
    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[0.8em] font-label font-bold text-emerald-700 tracking-[0.08em]">{band}</span>
  ))

  // 5) Linguistic terminology → bold
  work = work.replace(LINGUISTIC_KEYWORDS, (m) => nextToken(
    <span className="font-semibold text-slate-800">{m}</span>
  ))

  // 6) Arrow → styled arrow
  work = work.replace(ARROW_PATTERN, () => nextToken(
    <span className="mx-1 text-emerald-600 font-bold">→</span>
  ))

  // Now split work by the token markers and interleave the nodes
  const parts = work.split(/(§§\d+§§)/g)
  return parts.map((p, i) => {
    const match = p.match(/^§§(\d+)§§$/)
    if (match) {
      const token = tokens[Number(match[1])]
      return token ? <span key={`${keySeed}-t${i}`}>{token.node}</span> : p
    }
    return <span key={`${keySeed}-s${i}`}>{p}</span>
  })
}

function RichText({ text, className = '', paragraphClassName = '' }) {
  if (!text || typeof text !== 'string') return null
  const paragraphs = splitIntoParagraphs(text)
  return (
    <div className={`space-y-3 ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i} className={`text-sm leading-relaxed text-slate-700 ${paragraphClassName}`}>
          {renderFormattedInline(p, `p${i}`)}
        </p>
      ))}
    </div>
  )
}

// Inline variant for single-line strengths/improvements
function RichInline({ text }) {
  if (text == null) return null
  const str = typeof text === 'string' ? text : (typeof text === 'object' ? JSON.stringify(text) : String(text))
  return <>{renderFormattedInline(str)}</>
}

// formatDate / formatLongDate / CefrBadge imported from AnalyticsPrimitives
// (Tier 3 cleanup, 2026-05-02 — were verbatim copies). daysAgo kept local
// because its phrasing diverges from Dashboard.jsx ('today' vs 'Today',
// 'days ago' vs 'd ago').

function daysAgo(value) {
  if (!value) return null
  const ts = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(ts)) return null
  const diff = Math.floor((Date.now() - ts) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff} days ago`
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`
  if (diff < 365) return `${Math.floor(diff / 30)} months ago`
  return `${Math.floor(diff / 365)} years ago`
}

/* ============================================================================
   CEFR Metric definitions — used throughout for consistency
   ============================================================================ */

const METRICS = [
  {
    key: 'vocabularyRange',
    label: 'Vocabulary Range',
    shortLabel: 'Vocabulary',
    icon: 'book',
    description: 'Breadth and precision of lexical resources, including collocations, idioms, and register.',
    categories: ['vocabulary', 'collocation'],
    hue: { stroke: '#0891b2', fill: 'rgba(8, 145, 178, 0.08)' },
  },
  {
    key: 'grammaticalAccuracy',
    label: 'Grammatical Accuracy',
    shortLabel: 'Grammar',
    icon: 'spellcheck',
    description: 'Consistency and complexity of grammatical structures used under pressure.',
    categories: ['grammar'],
    hue: { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.08)' },
  },
  {
    key: 'fluencyAndCoherence',
    label: 'Fluency & Coherence',
    shortLabel: 'Fluency',
    icon: 'graphic_eq',
    description: 'Speech pacing, coherent organisation of extended turns, and minimal hesitation.',
    categories: [],
    hue: { stroke: '#059669', fill: 'rgba(5, 150, 105, 0.08)' },
  },
  {
    key: 'pronunciation',
    label: 'Pronunciation',
    shortLabel: 'Pronunciation',
    icon: 'record_voice_over',
    description: 'Intelligibility, word stress, sentence rhythm, and phonemic accuracy.',
    categories: ['pronunciation'],
    hue: { stroke: '#d97706', fill: 'rgba(217, 119, 6, 0.08)' },
  },
  {
    key: 'communicativeEffectiveness',
    label: 'Communicative Effectiveness',
    shortLabel: 'Communication',
    icon: 'forum',
    description: 'Ability to convey intended meaning, negotiate sense, and respond appropriately.',
    categories: ['pragmatics', 'register'],
    hue: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.08)' },
  },
]

function scoreToTier(value) {
  if (value >= 85) return { label: 'Advanced', color: 'text-emerald-600', bar: 'bg-emerald-400' }
  if (value >= 70) return { label: 'Consolidating', color: 'text-sky-600', bar: 'bg-sky-400' }
  if (value >= 55) return { label: 'Developing', color: 'text-amber-600', bar: 'bg-amber-400' }
  return { label: 'Emerging', color: 'text-rose-600', bar: 'bg-rose-400' }
}

/* ============================================================================
   MetricCard — clickable per-metric display with animated bar
   ============================================================================ */

function MetricCard({ metric, value, onClick, delta, description, animatedDelay = 0 }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0))
  const tier = scoreToTier(pct)
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-[1.25rem] border border-slate-200/60 bg-white/80 p-4 text-left transition-all duration-300 hover:border-sky-300 hover:shadow-md hover:-translate-y-0.5 cursor-pointer metric-card-enter"
      style={{ animationDelay: `${animatedDelay}ms` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base text-slate-400 group-hover:text-sky-600 transition-colors">{metric.icon}</span>
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600 leading-tight">{metric.label}</p>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-headline text-3xl text-slate-900 tabular-nums">{Math.round(pct)}</span>
        <span className={`text-[10px] font-label font-bold uppercase tracking-[0.12em] ${tier.color}`}>{tier.label}</span>
        {delta != null && Math.abs(delta) >= 1 && (
          <span className={`ml-auto text-[11px] font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {delta >= 0 ? '↑' : '↓'}{Math.abs(Math.round(delta))}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${tier.bar} metric-bar-fill`}
          style={{ '--target-width': `${pct}%`, animationDelay: `${animatedDelay + 200}ms` }}
        />
      </div>
      {description && (
        <p className="mt-2 text-[11px] text-slate-500 italic leading-snug line-clamp-2">{description}</p>
      )}
      <p className="mt-2 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Click for detail →
      </p>
    </button>
  )
}

/* ============================================================================
   MetricLineChart — SVG longitudinal chart for a single metric
   ============================================================================ */

function MetricLineChart({ metric, analyses, height = 180, onPointClick = null }) {
  const series = useMemo(() => {
    return [...analyses]
      .filter(a => a.lessonDate)
      .sort((a, b) => String(a.lessonDate).localeCompare(String(b.lessonDate)))
      .map(a => ({
        date: a.lessonDate,
        title: a.lessonTitle,
        value: Number(a[metric.key]) || 0,
        band: a.cefrBand,
        analysis: a,
      }))
  }, [analyses, metric.key])

  if (series.length === 0) return null

  const width = 600
  const pad = { top: 20, right: 24, bottom: 32, left: 34 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const xStep = series.length > 1 ? innerW / (series.length - 1) : 0
  const yAtVal = v => pad.top + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH

  const points = series.map((s, i) => ({
    x: pad.left + i * xStep,
    y: yAtVal(s.value),
    ...s,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${pad.top + innerH} L ${points[0].x.toFixed(1)} ${pad.top + innerH} Z`

  const firstVal = series[0].value
  const lastVal = series[series.length - 1].value
  const delta = lastVal - firstVal
  const avg = Math.round(series.reduce((a, b) => a + b.value, 0) / series.length)

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm" style={{ color: metric.hue.stroke }}>{metric.icon}</span>
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">{metric.label}</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>avg <span className="font-semibold text-slate-700 tabular-nums">{avg}</span></span>
          <span className={delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
            {delta >= 0 ? '↑' : '↓'}{Math.abs(Math.round(delta))} since first lesson
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto metric-chart" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(y => (
          <g key={y}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yAtVal(y)}
              y2={yAtVal(y)}
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray={y === 0 || y === 100 ? '' : '2,3'}
            />
            <text x={pad.left - 6} y={yAtVal(y) + 3} textAnchor="end" className="font-mono" fontSize="9" fill="#94a3b8">{y}</text>
          </g>
        ))}
        {/* X axis labels — first, middle, last */}
        {[0, Math.floor(series.length / 2), series.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => {
          const p = points[i]
          return (
            <text key={i} x={p.x} y={height - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {formatDate(p.date)}
            </text>
          )
        })}
        {/* Area fill */}
        <path d={areaPath} fill={metric.hue.fill} className="metric-area" />
        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={metric.hue.stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="metric-line"
          style={{ strokeDasharray: '1000', strokeDashoffset: '1000' }}
        />
        {/* Points — visible and clickable */}
        {points.map((p, i) => (
          <g
            key={i}
            className="metric-point"
            style={{ animationDelay: `${1200 + i * 80}ms` }}
            onClick={(e) => { e.stopPropagation(); onPointClick && onPointClick(p) }}
          >
            {/* Invisible larger hit target */}
            <circle cx={p.x} cy={p.y} r="12" fill="transparent" style={{ pointerEvents: onPointClick ? 'all' : 'none' }} />
            {/* Visible ring */}
            <circle cx={p.x} cy={p.y} r="5" fill="white" stroke={metric.hue.stroke} strokeWidth="2.5" />
            {/* Inner dot for weight */}
            <circle cx={p.x} cy={p.y} r="2" fill={metric.hue.stroke} />
            <title>{`${formatDate(p.date)} · ${Math.round(p.value)}/100 · ${p.title}`}</title>
          </g>
        ))}
      </svg>
    </div>
  )
}

function CollapsibleSection({ title, icon, children, defaultOpen = true, badge, subtitle }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="glass-panel rounded-[2rem] border border-white/50 editorial-shadow overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 sm:px-6 cursor-pointer hover:bg-white/30 transition"
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-lg text-slate-400">{icon}</span>
          <div className="text-left">
            <p className="font-label text-xs font-bold uppercase tracking-[0.26em] text-sky-700">{title}</p>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {badge != null && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-label font-bold text-sky-700 ml-1">{badge}</span>
          )}
        </div>
        <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && <div className="border-t border-slate-100 px-5 py-5 sm:px-6">{children}</div>}
    </div>
  )
}

function Modal({ open, onClose, title, children, widthClass = 'max-w-4xl' }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widthClass} max-h-[90vh] overflow-hidden rounded-[2rem] border border-white/60 bg-white shadow-2xl`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h3 className="font-headline text-xl text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Warm overview copy helpers
   ============================================================================ */

function buildWarmSummary(student, allAnalyses, lessons) {
  if (!student) return ''
  const name = String(student.name || '').split(' ')[0] || 'This student'
  const count = lessons?.length || 0
  if (!count) return `${name} hasn't started any lessons yet — when they do, a warm summary of their journey will appear here.`
  const latest = allAnalyses?.[0]
  const scores = (allAnalyses || []).map(a => Number(a?.overallScore) || 0).filter(s => s > 0)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const trend = scores.length >= 2 ? scores[0] - scores[scores.length - 1] : 0
  const trendText = trend > 3
    ? `clear upward momentum (${trend > 0 ? '+' : ''}${Math.round(trend)} points since their earliest lesson)`
    : trend < -3
      ? `a slight dip recently — worth keeping an eye on`
      : `steady progress holding around their current CEFR band`
  const topicPool = (lessons || []).flatMap(l => l.topics || [])
  const uniqueTopics = [...new Set(topicPool)]
  const topicLine = uniqueTopics.length
    ? ` The journey has spanned ${uniqueTopics.slice(0, 4).join(', ')}${uniqueTopics.length > 4 ? ` and ${uniqueTopics.length - 4} more themes` : ''}.`
    : ''
  const latestLine = latest
    ? ` Most recently we looked at "${latest.lessonTitle || 'a new lesson'}" and landed at ${latest.cefrBand || 'B2'} ${Math.round(latest.overallScore || 0)}.`
    : ''
  return `${name} has completed ${count} lesson${count === 1 ? '' : 's'} with us, averaging ${avg}/100 across every assessment and showing ${trendText}.${topicLine}${latestLine}`
}

function buildWarmOverallFeedbackIntro(name, strengthsCount, improvementsCount) {
  const first = name.split(' ')[0] || 'The student'
  if (!strengthsCount && !improvementsCount) return `We haven't aggregated enough feedback from ${first}'s lessons yet.`
  return `Looking across every assessment, here's what keeps showing up for ${first}. Strengths are the ones they can lean on; the areas to improve are recurring patterns worth focused practice.`
}

/* ============================================================================
   AdminInsightCardGrid — the block-style grid used throughout the admin panel
   to render strengths / improvements / key errors. Every card is clickable
   with an onOpenSource action that takes the admin straight to the lesson
   that produced that insight (or the cross-linked site section). This is
   the "over-reference" ethos — every claim earns a source link.
   ============================================================================ */

function AdminInsightCardGrid({ kind, items, onOpenSource, sourceLabel = '', linkTargets = {}, maxShown = 6 }) {
  if (!items || !items.length) return null
  const cls = kind === 'strength' ? 'is-strength' : kind === 'improvement' ? 'is-improvement' : 'is-error'
  const icon = kind === 'strength' ? 'check_circle' : kind === 'improvement' ? 'trending_up' : 'flag'
  const label = kind === 'strength' ? 'Strengths' : kind === 'improvement' ? 'Areas to target' : 'Key errors captured'
  const toneHeaderColor = kind === 'strength' ? 'text-emerald-700' : kind === 'improvement' ? 'text-amber-700' : 'text-rose-700'
  return (
    <div className="section-block rounded-[1.25rem] p-4">
      <p className={`font-label text-[10px] font-bold uppercase tracking-[0.2em] ${toneHeaderColor} mb-3 flex items-center gap-1.5 flex-wrap`}>
        <span className="material-symbols-outlined text-sm">{icon}</span>
        {label}
        <span className="text-[9px] font-normal text-slate-400 tracking-normal normal-case">— tap any card to open the source lesson</span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {items.slice(0, maxShown).map((item, i) => {
          // Items may be strings (strengths/improvements) OR dicts (keyErrors w/ correction)
          const isErr = kind === 'error' && typeof item === 'object'
          const text = isErr ? item.error : (typeof item === 'object' ? item.text : item)
          const count = typeof item === 'object' ? item.count : null
          const itemSourceLabel = item.sourceLabel || sourceLabel
          return (
            <button
              key={i}
              type="button"
              onClick={() => onOpenSource?.(item, i)}
              className={`insight-card ${cls} is-clickable block text-left w-full`}
            >
              <span className="insight-icon">
                <span className="material-symbols-outlined text-base">{icon}</span>
              </span>
              {isErr ? (
                <>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="font-mono text-xs text-rose-700 italic leading-relaxed flex-1">"<RichInline text={item.error} />"</p>
                    {item.category && (
                      <span className="shrink-0 rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.12em] text-rose-700">{item.category}</span>
                    )}
                  </div>
                  {item.correction && (
                    <p className="text-xs text-emerald-700 leading-relaxed"><span className="font-bold">→</span> <RichInline text={item.correction} /></p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={text} /></p>
              )}
              {(itemSourceLabel || count) && (
                <span className="insight-source-tag">
                  📎 {itemSourceLabel || `Seen in ${count} ${count === 1 ? 'lesson' : 'lessons'}`}
                </span>
              )}
              <span className="insight-practice-btn">
                <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                {isErr ? 'Open the error library entry' : 'See the source lesson'}
              </span>
            </button>
          )
        })}
      </div>
      {linkTargets.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
          {linkTargets.map((lt, i) => (
            <a
              key={i}
              href={lt.href}
              target={lt.newTab ? '_blank' : undefined}
              rel={lt.newTab ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 hover:border-sky-300 px-3 py-1.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-sky-700 transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-[11px]">{lt.icon || 'open_in_new'}</span>
              {lt.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   LessonArchiveCard — pedagogically-framed record for a single lesson.
   Renders learning aims (from topics), learning outcomes (lessonSummary +
   strengths), performance & attainment (the 5 CEFR metric scores), areas for
   development (improvements) and errors & corrections (keyErrors). Aims +
   outcomes summary show by default; the full attainment detail expands on
   demand. onOpen opens the existing full lesson detail modal.
   ============================================================================ */

function AttainmentBar({ label, value }) {
  const pct = Math.min(100, Math.max(0, Math.round(Number(value) || 0)))
  const tier = scoreToTier(pct)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 truncate">{label}</span>
        <span className="font-headline text-sm text-slate-900 tabular-nums">{pct}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-1.5 rounded-full ${tier.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function LessonArchiveCard({ lesson, analysis, pdf, onOpen, animatedDelay = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const topics = lesson.topics || []
  const strengths = (analysis?.strengths || []).filter(Boolean)
  const improvements = (analysis?.improvements || []).filter(Boolean)
  const keyErrors = (analysis?.keyErrors || []).filter(Boolean)

  return (
    <div
      className="metric-card-enter liquid-glass-card rounded-[1.5rem] border border-white/60 px-5 py-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_56px_-32px_rgba(2,132,199,0.55)]"
      style={{ animationDelay: `${animatedDelay}ms` }}
    >
      {/* Header: date · title · CEFR band · overall score */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.22em] text-sky-600">{formatLongDate(lesson.date)}</p>
          <h4 className="mt-1 font-headline text-2xl text-slate-900 leading-tight">{lesson.title}</h4>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {analysis && <CefrBadge band={analysis.cefrBand} score={analysis.overallScore} size="lg" />}
          {pdf && (
            <a
              href={pdf.url}
              onClick={e => e.stopPropagation()}
              target="_blank"
              rel="noopener"
              title="Download original lesson notes"
              className="rounded-full border border-sky-200 bg-sky-50 p-2 text-sky-700 hover:bg-sky-100 transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">download</span>
            </a>
          )}
        </div>
      </div>

      {/* Learning Aims — derived from lesson topics */}
      {topics.length > 0 && (
        <div className="mt-5">
          <p className="font-label text-xs font-bold uppercase tracking-[0.24em] text-sky-600 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">target</span>
            Learning Aims
          </p>
          <ul className="mt-2 space-y-1.5">
            {topics.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
                <span className="material-symbols-outlined text-sky-400 text-base shrink-0 mt-0.5">arrow_right</span>
                <span>To develop the learner&rsquo;s command of <span className="font-semibold text-slate-800">{t}</span>.</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Learning Outcomes — lessonSummary + strengths */}
      {(analysis?.lessonSummary || strengths.length > 0) && (
        <div className="mt-5">
          <p className="font-label text-xs font-bold uppercase tracking-[0.24em] text-emerald-600 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">emoji_objects</span>
            Learning Outcomes
          </p>
          {analysis?.lessonSummary && (
            <RichText text={analysis.lessonSummary} className="mt-2" />
          )}
          {strengths.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-emerald-800">
                  <span className="material-symbols-outlined text-emerald-500 text-base shrink-0 mt-0.5">check_circle</span>
                  <span>The learner demonstrated <RichInline text={s} /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Expandable: full attainment detail */}
      {expanded && analysis && (
        <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
          {/* Performance & Attainment — 5 CEFR metric scores */}
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.24em] text-sky-600 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">insights</span>
              Performance &amp; Attainment
            </p>
            <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {METRICS.map(m => (
                <AttainmentBar key={m.key} label={m.label} value={analysis[m.key]} />
              ))}
            </div>
          </div>

          {/* Areas for Development — improvements */}
          {improvements.length > 0 && (
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.24em] text-amber-600 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">trending_up</span>
                Areas for Development
              </p>
              <ul className="mt-2 space-y-1.5">
                {improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-amber-800">
                    <span className="material-symbols-outlined text-amber-500 text-base shrink-0 mt-0.5">arrow_circle_right</span>
                    <span>Developing competence in <RichInline text={imp} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Errors & Corrections — keyErrors */}
          {keyErrors.length > 0 && (
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.24em] text-rose-600 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">flag</span>
                Errors &amp; Corrections
              </p>
              <div className="mt-2 space-y-2">
                {keyErrors.map((err, i) => {
                  const isObj = typeof err === 'object' && err !== null
                  const errText = isObj ? err.error : err
                  return (
                    <div key={i} className="rounded-[1rem] border border-rose-100 bg-rose-50/50 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-xs italic text-rose-700 leading-relaxed flex-1">&ldquo;<RichInline text={errText} />&rdquo;</p>
                        {isObj && err.category && (
                          <span className="shrink-0 rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.12em] text-rose-700">{err.category}</span>
                        )}
                      </div>
                      {isObj && err.correction && (
                        <p className="mt-1 text-xs text-emerald-700 leading-relaxed"><span className="font-bold">→</span> <RichInline text={err.correction} /></p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card actions */}
      <div className="mt-5 flex items-center gap-2 flex-wrap">
        {analysis && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1.5 font-label text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700 hover:bg-sky-100 transition cursor-pointer"
          >
            <span className={`material-symbols-outlined text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
            {expanded ? 'Hide attainment detail' : 'View attainment detail'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen(lesson)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 font-label text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">menu_book</span>
          Open full lesson record
        </button>
        <span className="ml-auto font-label text-[11px] text-slate-400">
          {lesson.keywordCount || lesson.keywords?.length || 0} vocabulary items acquired
        </span>
      </div>
    </div>
  )
}

/* ============================================================================
   PDF Report Generator (uses window.jspdf loaded from /students/vendor/)
   ============================================================================ */

/* ============================================================================
   PDF Font loader — uses shared ensurePdfFonts from src/utils/pdf-loader.js
   (Tier 3 cleanup, 2026-05-02: was an inline copy with no VENDOR_V cache-bust).
   ============================================================================ */

// Download the student's full progress report as a PDF. Rendered server-side
// (headless Chrome) by the em-report service via /api/report, from the SAME data
// shown on screen — far higher typographic fidelity than the old client jsPDF.
async function generateStudentReport(student, assessment, feedback, enrichedAnalyses, lessons, totalKeywords, warmSummary) {
  const METRIC_KEYS = ['vocabularyRange', 'grammaticalAccuracy', 'fluencyAndCoherence', 'pronunciation', 'communicativeEffectiveness']
  const pickMetrics = (o) => METRIC_KEYS.reduce((acc, k) => { acc[k] = o?.[k] || 0; return acc }, {})
  const report = {
    organizationId: student?.organizationId || null,
    student: {
      name: student?.name || 'Student', slug: student?.slug || 'student',
      level: student?.level || '', targetLevel: student?.targetLevel || '',
    },
    meta: { lessons: lessons?.length || 0, assessments: enrichedAnalyses?.length || 0, vocabulary: totalKeywords || 0 },
    narrative: warmSummary || '',
    assessment: assessment ? {
      cefrBand: assessment.cefrBand, overallScore: assessment.overallScore,
      avgOverall: assessment.avgOverall, assessmentCount: assessment.assessmentCount,
      ...pickMetrics(assessment),
    } : null,
    patterns: {
      strengths: (feedback?.strengths || []).map(s => ({ text: s.text, count: s.count })),
      improvements: (feedback?.improvements || []).map(s => ({ text: s.text, count: s.count })),
    },
    lessons: (enrichedAnalyses || []).map(a => ({
      date: a.lessonDate, title: a.lessonTitle, cefrBand: a.cefrBand, overallScore: a.overallScore,
      metrics: pickMetrics(a), summary: a.lessonSummary || '',
      strengths: a.strengths || [], improvements: a.improvements || [], keyErrors: a.keyErrors || [],
    })),
  }
  let sessionToken = null
  try { sessionToken = JSON.parse(sessionStorage.getItem('conversa-admin-session') || '{}')?.sessionToken || null } catch { /* ignore */ }
  const resp = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken, report }),
  })
  if (!resp.ok) {
    alert(`Could not generate the report (HTTP ${resp.status}). Please try again.`)
    throw new Error(`report failed ${resp.status}`)
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${student?.slug || 'student'}-report-${new Date().toISOString().slice(0, 10)}.pdf`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/* ============================================================================
   Main component
   ============================================================================ */

export default function StudentDetail() {
  const { slug } = useParams()
  const [state, setState] = useState({ loading: true, error: '', data: null })

  // Scope the AI widget to the currently-viewed student so the admin can
  // query their data directly. The widget polls window.__STUDENT_SLUG on
  // every API call. __EM_ADMIN_MODE flips the widget into admin persona
  // (different header label, different system prompt on the server).
  useEffect(() => {
    if (!slug) return
    const prevSlug = window.__STUDENT_SLUG
    const prevAdmin = window.__EM_ADMIN_MODE
    window.__STUDENT_SLUG = slug
    window.__EM_ADMIN_MODE = true
    try { window.dispatchEvent(new CustomEvent('em-ai:student-changed', { detail: { slug, admin: true } })) } catch (_) {}
    return () => {
      window.__STUDENT_SLUG = prevSlug
      window.__EM_ADMIN_MODE = prevAdmin
    }
  }, [slug])
  const [pdfMap, setPdfMap] = useState({})
  const [levelHistory, setLevelHistory] = useState([])
  const [vocabSearch, setVocabSearch] = useState('')
  const [lessonFilter, setLessonFilter] = useState('')
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [selectedKeyword, setSelectedKeyword] = useState(null)
  const [selectedMetric, setSelectedMetric] = useState(null) // { metric, scope: 'overall' | 'lesson', analysis? }
  const [reportBusy, setReportBusy] = useState(false)

  // Assignment (teacher + course) — roster data + inline editor state.
  const [teachers, setTeachers] = useState([])
  const [groups, setGroups] = useState([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignDraft, setAssignDraft] = useState({ primaryTeacherId: '', groupId: '' })
  const [assignSaving, setAssignSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState({ loading: true, error: '', data: null })
      try {
        const [data, pdfResp] = await Promise.all([
          queryAdminConvex('students:getStudentDashboard', { studentSlug: slug }),
          fetch('/lesson-pdfs.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
        ])
        if (!cancelled) {
          setState({ loading: false, error: '', data })
          setPdfMap(pdfResp || {})
        }
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: 'Failed to load student data.', data: null })
      }
    }
    load()
    return () => { cancelled = true }
  }, [slug])

  const refreshDashboard = useCallback(async () => {
    try {
      const data = await queryAdminConvex('students:getStudentDashboard', { studentSlug: slug })
      setState(s => ({ ...s, data }))
    } catch { /* keep current view on transient failure */ }
  }, [slug])

  // Teachers + courses for the assignment panel, scoped to the student's school.
  const studentOrgId = state.data?.student?.organizationId
  useEffect(() => {
    if (!studentOrgId) { setTeachers([]); setGroups([]); return }
    let cancelled = false
    Promise.all([
      queryAdminConvex('teachers:listTeachers', { organizationId: studentOrgId }).catch(() => []),
      queryAdminConvex('groups:listGroups', { organizationId: studentOrgId }).catch(() => []),
    ]).then(([t, g]) => { if (!cancelled) { setTeachers(t || []); setGroups(g || []) } })
    return () => { cancelled = true }
  }, [studentOrgId])

  // CEFR level-change history (audit-log backed). Loaded once we know the
  // student's _id from the dashboard payload.
  const studentId = state.data?.student?._id
  useEffect(() => {
    if (!studentId) { setLevelHistory([]); return }
    let cancelled = false
    queryAdminConvex('students:getStudentLevelHistory', { studentId })
      .then(rows => { if (!cancelled) setLevelHistory(rows || []) })
      .catch(() => { if (!cancelled) setLevelHistory([]) })
    return () => { cancelled = true }
  }, [studentId])

  // Build lessonId → lesson date map so we can fix the date bug on analyses
  const lessonMetaById = useMemo(() => {
    const map = {}
    const lessons = state.data?.lessons || []
    for (const l of lessons) {
      if (l?._id) map[String(l._id)] = { date: l.date, title: l.title, topics: l.topics || [] }
    }
    return map
  }, [state.data])

  // Join analyses with their lesson date/title
  const enrichedAnalyses = useMemo(() => {
    const analyses = state.data?.allAnalyses || []
    return analyses.map(a => {
      const meta = lessonMetaById[String(a.lessonId || '')] || {}
      return {
        ...a,
        lessonDate: meta.date || a.date || null,
        lessonTitle: meta.title || a.lessonTitle || 'Lesson',
        lessonTopics: meta.topics || [],
      }
    }).sort((x, y) => {
      // Sort by lesson date descending (most recent first)
      const dx = x.lessonDate || ''
      const dy = y.lessonDate || ''
      if (dx && dy) return dy.localeCompare(dx)
      return (Number(y.createdAt || 0) - Number(x.createdAt || 0))
    })
  }, [state.data, lessonMetaById])

  // Sorted lessons (most recent first)
  const sortedLessons = useMemo(() => {
    const lessons = state.data?.lessons || []
    return [...lessons].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  }, [state.data])

  const filteredLessons = useMemo(() => {
    const q = lessonFilter.trim().toLowerCase()
    if (!q) return sortedLessons
    return sortedLessons.filter(l =>
      [l.title, l.date, l.summary, ...(l.topics || [])].join(' ').toLowerCase().includes(q)
    )
  }, [sortedLessons, lessonFilter])

  // Per-lesson analysis lookup
  const analysisByLessonId = useMemo(() => {
    const map = {}
    for (const a of enrichedAnalyses) {
      if (a.lessonId) map[String(a.lessonId)] = a
    }
    return map
  }, [enrichedAnalyses])

  // Flatten keywords with lesson context
  const allKeywords = useMemo(() => {
    const lessons = state.data?.lessons || []
    const out = []
    for (const lesson of lessons) {
      for (const kw of lesson.keywords || []) {
        out.push({
          ...kw,
          lessonId: lesson._id || lesson.id,
          lessonTitle: lesson.title,
          lessonDate: lesson.date,
        })
      }
    }
    return out
  }, [state.data])

  const filteredVocab = useMemo(() => {
    const q = vocabSearch.trim().toLowerCase()
    if (!q) return allKeywords.slice(0, 200)
    return allKeywords.filter(k =>
      [k.word, k.translation, k.ipa, k.definitionEn, k.definitionPl, k.exampleEn, k.examplePl, k.lessonTitle]
        .join(' ').toLowerCase().includes(q)
    ).slice(0, 200)
  }, [allKeywords, vocabSearch])

  // Aggregate assessment summary
  const overallAssessment = useMemo(() => {
    if (!enrichedAnalyses.length) return null
    const latest = enrichedAnalyses[0]
    const prev = enrichedAnalyses.length > 1 ? enrichedAnalyses[1] : null
    const avg = (field) => {
      const vals = enrichedAnalyses.map(a => Number(a[field]) || 0).filter(v => v > 0)
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    }
    const result = {
      cefrBand: latest?.cefrBand || 'N/A',
      overallScore: latest?.overallScore || 0,
      avgOverall: avg('overallScore'),
      assessmentCount: enrichedAnalyses.length,
      delta: prev ? Math.round(latest.overallScore - prev.overallScore) : null,
      deltas: {},
    }
    // Populate per-metric values, averages, and deltas from the METRICS array
    for (const m of METRICS) {
      result[m.key] = latest?.[m.key] || 0
      result[`avg${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`] = avg(m.key)
      result.deltas[m.key] = prev ? Math.round((latest?.[m.key] || 0) - (prev?.[m.key] || 0)) : null
    }
    return result
  }, [enrichedAnalyses])

  const overallFeedback = useMemo(() => {
    if (!enrichedAnalyses.length) return { strengths: [], improvements: [] }
    const collectedStrengths = enrichedAnalyses.flatMap(a => a.strengths || [])
    const collectedImprovements = enrichedAnalyses.flatMap(a => a.improvements || [])
    function buildFrequencyRank(itemList) {
      const map = new Map()
      itemList.forEach(entry => {
        const key = String(entry || '').trim()
        if (!key) return
        map.set(key, (map.get(key) || 0) + 1)
      })
      return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([text, count]) => ({ text, count }))
    }
    return {
      strengths: buildFrequencyRank(collectedStrengths),
      improvements: buildFrequencyRank(collectedImprovements),
    }
  }, [enrichedAnalyses])

  // Loading / error states
  if (state.loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-slate-400 animate-pulse">
          <Link to="/admin" className="hover:text-sky-600">← Back to roster</Link>
        </div>
        {[1, 2, 3, 4].map(i => <div key={i} className="h-48 rounded-[2rem] bg-slate-100 animate-pulse" />)}
      </div>
    )
  }

  if (state.error || !state.data) {
    return (
      <div className="glass-panel rounded-[2rem] border border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Student not found</h2>
        <p className="mt-2 text-sm text-rose-700">{state.error || `No student found with slug "${slug}".`}</p>
        <Link to="/admin" className="mt-4 inline-block rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 transition">← Back to roster</Link>
      </div>
    )
  }

  const { student, lessons, totalKeywords, recentQuizzes, avgAccuracy } = state.data
  const latestAnalysis = enrichedAnalyses[0] || null
  const initials = String(student?.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
  const studentPdfs = pdfMap[slug] || []
  const pdfByDate = Object.fromEntries(studentPdfs.map(p => [p.date, p]))
  const warmSummary = buildWarmSummary(student, enrichedAnalyses, lessons)

  // Editorial hero name split — final word accented (Dashboard.jsx pattern)
  const nameParts = String(student?.name || 'Student').trim().split(/\s+/)
  const heroFirst = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const heroLast = nameParts[nameParts.length - 1] || 'Student'

  // Resolve the current teacher + course names for the assignment panel.
  const assignedTeacherName = student?.primaryTeacherId
    ? (teachers.find(t => String(t._id) === String(student.primaryTeacherId))?.name || '')
    : ''
  const assignedCourseName = student?.groupId
    ? (groups.find(g => String(g._id) === String(student.groupId))?.name || '')
    : ''

  function openAssign() {
    setAssignDraft({
      primaryTeacherId: student?.primaryTeacherId ? String(student.primaryTeacherId) : '',
      groupId: student?.groupId ? String(student.groupId) : '',
    })
    setAssignOpen(true)
  }
  async function saveAssign() {
    setAssignSaving(true)
    try {
      await persistAssignment(student, assignDraft)
      await refreshDashboard()
      setAssignOpen(false)
    } catch { /* surfaced inline below if needed */ }
    finally { setAssignSaving(false) }
  }

  return (
    <div className="space-y-6">
      {/* ── Editorial hero — the learner's academic record ─────────── */}
      <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/50 px-6 py-8 sm:px-10 sm:py-10 editorial-shadow">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 50% 70% at 95% 0%, rgba(14,165,233,0.10), transparent 60%),
              radial-gradient(ellipse 40% 50% at 5% 100%, rgba(37,99,235,0.07), transparent 55%)`,
          }}
        />
        <div className="relative">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 font-label text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50 transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to roster
            </Link>
            <button
              type="button"
              disabled={reportBusy}
              onClick={async () => {
                setReportBusy(true)
                try {
                  await generateStudentReport(student, overallAssessment, overallFeedback, enrichedAnalyses, lessons, totalKeywords, warmSummary)
                } catch { /* alerted in generator */ }
                finally { setReportBusy(false) }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)] transition-all duration-300 enabled:cursor-pointer disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">{reportBusy ? 'hourglass_top' : 'picture_as_pdf'}</span>
              {reportBusy ? 'Generating…' : 'Download Full Report'}
            </button>
          </div>

          <p className="mt-7 font-label text-xs font-bold uppercase tracking-[0.32em] text-sky-600">Academic Record · Conversa School</p>

          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-5">
              <Avatar name={student?.name} size={76} ring className="sm:!h-20 sm:!w-20" />
              <div>
                <h1 className="font-headline text-4xl sm:text-5xl text-slate-900 leading-[1.02]">
                  {heroFirst && <>{heroFirst} </>}<span className="italic text-sky-600">{heroLast}</span>
                </h1>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <CefrBadge band={student?.level || 'N/A'} size="lg" />
                  {student?.targetLevel && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-label font-bold uppercase tracking-[0.14em] text-sky-700">
                      <span className="material-symbols-outlined text-[13px]">flag</span>
                      Target {student.targetLevel}
                    </span>
                  )}
                  {student?.status === 'active' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-label font-bold uppercase tracking-[0.16em] text-emerald-700">
                      <span className="block h-1.5 w-1.5 rounded-full bg-emerald-500" />Active Learner
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:flex sm:gap-3">
              <div className="liquid-glass-card metric-card-enter rounded-[1.25rem] px-4 py-3 text-center" style={{ animationDelay: '0ms' }}>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Lessons</p>
                <p className="mt-1 font-headline text-3xl text-slate-900">{lessons?.length || 0}</p>
              </div>
              <div className="liquid-glass-card metric-card-enter rounded-[1.25rem] px-4 py-3 text-center" style={{ animationDelay: '80ms' }}>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Vocabulary</p>
                <p className="mt-1 font-headline text-3xl text-slate-900">{totalKeywords || 0}</p>
              </div>
              <div className="liquid-glass-card metric-card-enter rounded-[1.25rem] px-4 py-3 text-center" style={{ animationDelay: '160ms' }}>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Assessments</p>
                <p className="mt-1 font-headline text-3xl text-slate-900">{enrichedAnalyses.length}</p>
              </div>
              {recentQuizzes?.length ? (
                <div className="liquid-glass-card metric-card-enter rounded-[1.25rem] px-4 py-3 text-center" style={{ animationDelay: '240ms' }}>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Quiz Avg</p>
                  <p className="mt-1 font-headline text-3xl text-slate-900">{Math.round(avgAccuracy || 0)}%</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Warm summary paragraph */}
          <p className="mt-6 text-[15px] leading-relaxed text-slate-600 max-w-4xl">{warmSummary}</p>
        </div>
      </section>

      {/* ── Assignment — teacher + course, editable inline ─────────── */}
      <section className="glass-panel px-5 py-5 editorial-shadow sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="font-label text-[11px] uppercase tracking-[0.24em]" style={{ color: 'var(--ca-accent)' }}>Assignment</p>
            <span className="hidden sm:block h-4 w-px bg-slate-200" />
            <TeacherChip name={assignedTeacherName} onClick={openAssign} />
            <CourseChip name={assignedCourseName} onClick={openAssign} />
          </div>
          {!assignOpen && (
            <button type="button" onClick={openAssign} className="ca-btn ca-btn--soft self-start sm:self-auto" style={{ padding: '0.55rem 1rem', fontSize: 13 }}>
              <span className="material-symbols-outlined text-base">swap_horiz</span>
              Change
            </button>
          )}
        </div>

        {assignOpen && (
          <div className="ca-slidedown mt-4 rounded-[1.25rem] border border-slate-100 bg-slate-50/60 px-4 py-4">
            <AssignFields teachers={teachers} groups={groups} value={assignDraft} onChange={setAssignDraft} idPrefix="detail" />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setAssignOpen(false)} className="ca-btn ca-btn--ghost">Cancel</button>
              <button type="button" onClick={saveAssign} disabled={assignSaving} className="ca-btn ca-btn--primary">
                <span className="material-symbols-outlined text-base">{assignSaving ? 'progress_activity' : 'check'}</span>
                {assignSaving ? 'Saving…' : 'Save assignment'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* CEFR Analysis — Clinical detail in drop-downs */}
      {latestAnalysis && (
        <CollapsibleSection
          title="CEFR Analysis"
          icon="analytics"
          badge={overallAssessment?.cefrBand || latestAnalysis.cefrBand}
          subtitle="Per-skill breakdown with latest and longitudinal averages"
          defaultOpen={true}
        >
          <div className="space-y-6">
            {/* Latest assessment header */}
            <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                <div>
                  <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Latest Assessment</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Snapshot from the most recent lesson · click any metric to open its deep dive
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CefrBadge band={overallAssessment.cefrBand} score={overallAssessment.overallScore} size="lg" />
                  {overallAssessment.delta != null && Math.abs(overallAssessment.delta) >= 1 && (
                    <span className={`text-xs font-bold ${overallAssessment.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {overallAssessment.delta >= 0 ? '↑' : '↓'}{Math.abs(overallAssessment.delta)} vs prior
                    </span>
                  )}
                  <span className="text-[10px] font-label text-slate-400">{overallAssessment.assessmentCount} total</span>
                </div>
              </div>
              {/* Metric cards — proper spacing, clickable */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                {METRICS.map((m, i) => (
                  <MetricCard
                    key={m.key}
                    metric={m}
                    value={overallAssessment[m.key]}
                    description={m.description}
                    delta={overallAssessment.deltas?.[m.key]}
                    onClick={() => setSelectedMetric({ metric: m, scope: 'overall' })}
                    animatedDelay={i * 80}
                  />
                ))}
              </div>
              {/* Rolling averages strip */}
              <div className="mt-5 rounded-[1rem] border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2.5">
                  Rolling average across {overallAssessment.assessmentCount} assessment{overallAssessment.assessmentCount === 1 ? '' : 's'}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-5">
                  {METRICS.map(m => {
                    const avgKey = `avg${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`
                    return (
                      <div key={m.key} className="flex items-baseline gap-1.5">
                        <span className="material-symbols-outlined text-[14px] text-slate-400">{m.icon}</span>
                        <span className="text-[10px] font-label text-slate-500 truncate">{m.shortLabel}</span>
                        <span className="ml-auto text-sm font-semibold text-slate-700 tabular-nums">{overallAssessment[avgKey] ?? '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Longitudinal charts for each metric */}
            {enrichedAnalyses.length > 1 && (
              <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-5 py-5 sm:px-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Longitudinal Progression</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Each metric over every graded lesson. Click anywhere on a chart for the rolling deep dive, or click any node to jump to that lesson's per-metric commentary.
                    </p>
                  </div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  {METRICS.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setSelectedMetric({ metric: m, scope: 'overall' })}
                      className="rounded-[1.25rem] border border-slate-200/60 bg-white/70 px-4 py-3 text-left hover:border-sky-300 hover:shadow-sm transition cursor-pointer"
                    >
                      <MetricLineChart
                        metric={m}
                        analyses={enrichedAnalyses}
                        onPointClick={(p) => setSelectedMetric({ metric: m, scope: 'lesson', analysis: p.analysis })}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Overall Feedback — block grid with frequency counts + cross-links */}
            {(overallFeedback.strengths.length > 0 || overallFeedback.improvements.length > 0) && (
              <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-5 py-4 space-y-5">
                <div>
                  <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Overall Pattern</p>
                  <p className="text-sm text-slate-600 italic">{buildWarmOverallFeedbackIntro(student?.name || '', overallFeedback.strengths.length, overallFeedback.improvements.length)}</p>
                </div>
                <AdminInsightCardGrid
                  kind="strength"
                  items={overallFeedback.strengths.slice(0, 8)}
                  onOpenSource={() => { window.open(`/app/${slug}/lessons`, '_blank') }}
                  maxShown={8}
                  linkTargets={[
                    { href: `/app/${slug}/lessons`, label: 'Open Student Lessons tab', icon: 'menu_book', newTab: true },
                    { href: `/app/${slug}/dashboard`, label: 'Open Student Dashboard', icon: 'dashboard', newTab: true },
                  ]}
                />
                <AdminInsightCardGrid
                  kind="improvement"
                  items={overallFeedback.improvements.slice(0, 8)}
                  onOpenSource={(item) => { window.open(`/app/${slug}/practice?focus=${encodeURIComponent(String(item.text || '').slice(0, 80))}`, '_blank') }}
                  maxShown={8}
                  linkTargets={[
                    { href: `/app/${slug}/practice`, label: 'Open Practice Arena', icon: 'sports_esports', newTab: true },
                    { href: `/app/${slug}/knowledge`, label: 'Open Error Library', icon: 'flag', newTab: true },
                  ]}
                />
              </div>
            )}

            {/* Last Lesson Feedback — clinical */}
            <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-5 py-4">
              <div className="flex items-center flex-wrap gap-2 mb-3">
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Most Recent Lesson</p>
                <span className="text-xs text-slate-400 font-label">· {latestAnalysis.lessonTitle}</span>
                <span className="text-xs text-slate-400 ml-auto">{formatLongDate(latestAnalysis.lessonDate)}</span>
              </div>
              {latestAnalysis.lessonSummary && (
                <RichText text={latestAnalysis.lessonSummary} className="mb-3" />
              )}
              {(() => {
                const lessonRef = `${formatDate(latestAnalysis.lessonDate)} · ${latestAnalysis.lessonTitle || 'this session'}`
                const openLatest = () => setSelectedLesson({
                  ...lessons.find(l => String(l._id) === String(latestAnalysis.lessonId)) || latestAnalysis,
                  analysis: latestAnalysis,
                })
                return (
                  <div className="space-y-5 mt-3">
                    <AdminInsightCardGrid
                      kind="strength"
                      items={(latestAnalysis.strengths || []).filter(Boolean)}
                      onOpenSource={openLatest}
                      sourceLabel={`From ${lessonRef}`}
                      maxShown={6}
                    />
                    <AdminInsightCardGrid
                      kind="improvement"
                      items={(latestAnalysis.improvements || []).filter(Boolean)}
                      onOpenSource={openLatest}
                      sourceLabel={`From ${lessonRef}`}
                      maxShown={6}
                    />
                    <AdminInsightCardGrid
                      kind="error"
                      items={(latestAnalysis.keyErrors || []).filter(Boolean)}
                      onOpenSource={() => { window.open(`/app/${slug}/knowledge`, '_blank') }}
                      sourceLabel={`From ${lessonRef}`}
                      maxShown={6}
                      linkTargets={[
                        { href: `/app/${slug}/knowledge`, label: 'Open Error Library (new tab)', icon: 'flag', newTab: true },
                        { href: `/app/${slug}/practice`, label: 'Open Practice Arena', icon: 'sports_esports', newTab: true },
                      ]}
                    />
                  </div>
                )
              })()}
              {latestAnalysis.practiceAdvice?.length > 0 && (
                <div className="mt-4 rounded-[1rem] border border-sky-100 bg-sky-50/40 px-3 py-2">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 mb-1">Practice Advice</p>
                  <ul className="space-y-1">
                    {latestAnalysis.practiceAdvice.slice(0, 5).map((p, i) => (
                      <li key={i} className="text-xs text-slate-700 leading-relaxed">• <SafeText value={p} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Progress History — fixed date display */}
      {enrichedAnalyses.length > 1 && (
        <CollapsibleSection
          title="Learning Progression"
          icon="trending_up"
          badge={`${enrichedAnalyses.length} assessments`}
          subtitle="Longitudinal record of the learner's attainment across every graded lesson, newest first"
          defaultOpen={true}
        >
          <div className="space-y-3">
            {enrichedAnalyses.map((a, i) => {
              const next = enrichedAnalyses[i + 1]
              const deltaOverall = next ? Math.round((a.overallScore || 0) - (next.overallScore || 0)) : null
              return (
                <div
                  key={a._id || i}
                  className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-3 hover:border-sky-200 transition cursor-pointer"
                  onClick={() => {
                    const lesson = sortedLessons.find(l => String(l._id || l.id) === String(a.lessonId))
                    if (lesson) setSelectedLesson(lesson)
                  }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="font-label text-xs font-bold text-slate-400 shrink-0">{formatDate(a.lessonDate || a.createdAt)}</span>
                      <CefrBadge band={a.cefrBand} score={a.overallScore} />
                      <p className="text-sm text-slate-700 truncate">{a.lessonTitle}</p>
                    </div>
                    {deltaOverall != null && Math.abs(deltaOverall) > 0 && (
                      <span className={`text-xs font-bold shrink-0 ${deltaOverall >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {deltaOverall >= 0 ? '↑' : '↓'}{Math.abs(deltaOverall)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {[
                      { l: 'Vocab', v: a.vocabularyRange },
                      { l: 'Grammar', v: a.grammaticalAccuracy },
                      { l: 'Fluency', v: a.fluencyAndCoherence },
                      { l: 'Pronun.', v: a.pronunciation },
                      { l: 'Comm.', v: a.communicativeEffectiveness },
                    ].map(({ l, v }) => (
                      <div key={l} className="text-center">
                        <p className="text-[10px] font-label uppercase text-slate-400">{l}</p>
                        <p className="text-sm font-semibold text-slate-700">{Math.round(v || 0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* CEFR level-change history — surgical mini-section */}
      {levelHistory.length > 0 && (
        <CollapsibleSection
          title="Level History"
          icon="history"
          badge={`${levelHistory.length} change${levelHistory.length === 1 ? '' : 's'}`}
          subtitle="Recorded CEFR level changes for this learner, newest first"
          defaultOpen={true}
        >
          <div className="space-y-2">
            {levelHistory.map((h) => (
              <div key={h._id} className="liquid-glass-card flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/60 px-4 py-3">
                <span className="font-label text-xs font-bold text-slate-400 shrink-0">{formatDate(h.timestamp)}</span>
                <div className="flex items-center gap-2">
                  <CefrBadge band={h.from || '—'} />
                  <span className="text-emerald-600 font-bold">→</span>
                  <CefrBadge band={h.to || '—'} />
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Lesson Archive — pedagogically-framed record per lesson */}
      <CollapsibleSection
        title="Lesson Archive"
        icon="menu_book"
        badge={`${lessons?.length || 0} delivered`}
        subtitle="A complete record of learning aims, outcomes and attainment for every lesson delivered."
        defaultOpen={true}
      >
        <input
          type="search"
          placeholder="Search the archive by title, topic, date, or summary..."
          value={lessonFilter}
          onChange={(e) => setLessonFilter(e.target.value)}
          className="w-full rounded-xl border border-slate-200/60 bg-white/60 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100 mb-4"
        />
        <div className="space-y-4 max-h-[820px] overflow-y-auto pr-1">
          {filteredLessons.length ? filteredLessons.map((lesson, i) => {
            const analysis = analysisByLessonId[String(lesson._id || lesson.id)]
            const pdf = pdfByDate[lesson.date]
            return (
              <LessonArchiveCard
                key={lesson._id || lesson.id}
                lesson={lesson}
                analysis={analysis}
                pdf={pdf}
                onOpen={setSelectedLesson}
                animatedDelay={Math.min(i, 8) * 60}
              />
            )
          }) : <p className="text-sm text-slate-500 text-center py-4">No lessons found.</p>}
        </div>
      </CollapsibleSection>

      {/* Vocabulary Acquisition — rich detail matching student panel */}
      <CollapsibleSection
        title="Vocabulary Acquisition"
        icon="translate"
        badge={`${totalKeywords || allKeywords.length} words`}
        subtitle="Every lexical item the learner has acquired — click for full detail"
        defaultOpen={false}
      >
        <input
          type="search"
          placeholder="Search keywords, translations, definitions, examples..."
          value={vocabSearch}
          onChange={(e) => setVocabSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200/60 bg-white/60 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100 mb-4"
        />
        <div className="grid gap-2 sm:grid-cols-2 max-h-[600px] overflow-y-auto pr-1">
          {filteredVocab.length ? filteredVocab.map((kw, i) => (
            <button
              key={`${kw._id || kw.id || 'k'}-${i}`}
              type="button"
              onClick={() => setSelectedKeyword(kw)}
              className="rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2 text-left hover:border-sky-200 hover:bg-sky-50/30 transition cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{kw.word}</span>
                    {kw.ipa && <span className="font-mono text-[11px] text-sky-700">{kw.ipa}</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{kw.translation}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {kw.difficulty && <span className="rounded-full bg-slate-50 border border-slate-200 px-1.5 py-0.5 text-[10px] font-label font-bold text-slate-500">{kw.difficulty}</span>}
                  {kw.mastery != null && kw.mastery > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="h-1 w-8 rounded-full bg-slate-100">
                        <div className={`h-1 rounded-full ${kw.mastery >= 70 ? 'bg-emerald-400' : kw.mastery >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${Math.min(100, kw.mastery)}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400">{kw.mastery}%</span>
                    </div>
                  )}
                </div>
              </div>
              {kw.definitionEn && <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{kw.definitionEn}</p>}
            </button>
          )) : <p className="text-sm text-slate-500 text-center py-4 col-span-full">{vocabSearch ? 'No keywords match your search.' : 'No vocabulary recorded yet.'}</p>}
          {filteredVocab.length >= 200 && <p className="text-xs text-slate-400 text-center pt-2 col-span-full">Showing first 200 results. Use search to narrow down.</p>}
        </div>
      </CollapsibleSection>

      {/* Quiz Results */}
      <CollapsibleSection
        title="Quiz Results"
        icon="quiz"
        badge={`${recentQuizzes?.length || 0} completed`}
        defaultOpen={false}
      >
        {recentQuizzes?.length ? (
          <div className="space-y-2">
            {recentQuizzes.map((quiz, i) => (
              <div key={quiz._id || i} className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{formatDate(quiz.completedAt)}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{quiz.quizType || 'Vocabulary Quiz'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-[10px] font-label uppercase text-slate-400">Score</p>
                      <p className={`text-lg font-bold ${quiz.accuracy >= 80 ? 'text-emerald-600' : quiz.accuracy >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{Math.round(quiz.accuracy)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-label uppercase text-slate-400">Correct</p>
                      <p className="text-sm font-semibold text-slate-700">{quiz.correctAnswers}/{quiz.totalQuestions}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500 text-center py-4">No quiz results yet.</p>}
      </CollapsibleSection>

      {/* Downloads — source documents behind the academic record */}
      <CollapsibleSection
        title="Downloads"
        icon="cloud_download"
        badge={`${studentPdfs.length} lesson notes`}
        subtitle="Source teacher notes and lesson transcripts underpinning this record"
        defaultOpen={false}
      >
        {studentPdfs.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...studentPdfs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map((pdf, i) => (
              <a
                key={i}
                href={pdf.url}
                target="_blank"
                rel="noopener"
                className="liquid-glass-card flex items-center gap-3 rounded-[1.25rem] border border-white/60 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_40px_-26px_rgba(2,132,199,0.5)]"
              >
                <span className="material-symbols-outlined text-2xl text-rose-400 shrink-0">picture_as_pdf</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-label font-bold uppercase tracking-[0.16em] text-slate-400">{formatDate(pdf.date)}</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{pdf.filename}</p>
                </div>
                <span className="material-symbols-outlined text-slate-400 text-sm shrink-0">download</span>
              </a>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500 text-center py-4">No lesson PDFs available for this student.</p>}
      </CollapsibleSection>

      {/* Lesson Detail Modal */}
      <Modal open={!!selectedLesson} onClose={() => setSelectedLesson(null)} title={selectedLesson?.title || 'Lesson'} widthClass="max-w-5xl">
        {selectedLesson && (() => {
          const analysis = analysisByLessonId[String(selectedLesson._id || selectedLesson.id)]
          const pdf = pdfByDate[selectedLesson.date]
          return (
            <div className="space-y-5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-3 py-1 text-xs font-label font-bold uppercase tracking-[0.18em] text-white">
                  {formatLongDate(selectedLesson.date)}
                </span>
                {analysis && <CefrBadge band={analysis.cefrBand} score={analysis.overallScore} size="lg" />}
                {pdf && (
                  <a
                    href={pdf.url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-label font-bold uppercase tracking-[0.16em] text-sky-700 hover:bg-sky-100 transition"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Lesson Notes (PDF)
                  </a>
                )}
              </div>

              {selectedLesson.topics?.length > 0 && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Topics Covered</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedLesson.topics.map((t, i) => (
                      <span key={i} className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-label text-slate-700">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLesson.summary && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Conversation Notes</p>
                  <RichText text={selectedLesson.summary} />
                </div>
              )}

              {analysis && (
                <>
                  <div>
                    <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Lesson Summary</p>
                    {analysis.lessonSummary ? <RichText text={analysis.lessonSummary} /> : <p className="text-sm italic text-slate-500">No summary recorded.</p>}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                    {METRICS.map((m, i) => (
                      <MetricCard
                        key={m.key}
                        metric={m}
                        value={analysis[m.key] || 0}
                        onClick={() => { setSelectedLesson(null); setTimeout(() => setSelectedMetric({ metric: m, scope: 'lesson', analysis }), 50) }}
                        animatedDelay={i * 60}
                      />
                    ))}
                  </div>

                  {(analysis.strengths?.length > 0 || analysis.improvements?.length > 0) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {analysis.strengths?.length > 0 && (
                        <div>
                          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-2">Strengths</p>
                          <ul className="space-y-1.5">
                            {analysis.strengths.filter(Boolean).map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                                <span className="material-symbols-outlined text-emerald-400 text-sm mt-0.5 shrink-0">check_circle</span>
                                <RichInline text={s} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.improvements?.length > 0 && (
                        <div>
                          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-2">Areas to Improve</p>
                          <ul className="space-y-1.5">
                            {analysis.improvements.filter(Boolean).map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                                <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5 shrink-0">trending_up</span>
                                <RichInline text={s} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {analysis.keyErrors?.length > 0 && (
                    <div>
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 mb-2">Key Errors & Corrections</p>
                      <div className="space-y-2">
                        {analysis.keyErrors.map((err, i) => (
                          <div key={i} className="rounded-[1rem] border border-slate-200 bg-slate-50/60 px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-mono text-xs text-rose-700 italic leading-relaxed flex-1">"<SafeText value={err.error} />"</p>
                              {err.category && (
                                <span className="shrink-0 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600">{err.category}</span>
                              )}
                            </div>
                            {err.correction && (
                              <p className="mt-1 text-xs text-emerald-700 leading-relaxed">→ <SafeText value={err.correction} /></p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.practiceAdvice?.length > 0 && (
                    <div className="rounded-[1rem] border border-sky-100 bg-sky-50/40 px-4 py-3">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 mb-2">Practice Advice</p>
                      <ul className="space-y-1">
                        {analysis.practiceAdvice.map((p, i) => (
                          <li key={i} className="text-sm text-slate-700 leading-relaxed">• <SafeText value={p} /></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {selectedLesson.keywords?.length > 0 && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Keywords from this lesson ({selectedLesson.keywords.length})</p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {selectedLesson.keywords.map((kw, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setSelectedKeyword({ ...kw, lessonTitle: selectedLesson.title, lessonDate: selectedLesson.date }); setSelectedLesson(null) }}
                        className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-sky-300 hover:bg-sky-50 transition cursor-pointer"
                      >
                        {kw.word}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Keyword Detail Modal */}
      <Modal open={!!selectedKeyword} onClose={() => setSelectedKeyword(null)} title={selectedKeyword?.word || 'Keyword'} widthClass="max-w-2xl">
        {selectedKeyword && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="font-headline text-3xl text-slate-900">{selectedKeyword.word}</p>
              {selectedKeyword.ipa && <span className="font-mono text-sm text-sky-700">{selectedKeyword.ipa}</span>}
              {selectedKeyword.difficulty && <CefrBadge band={selectedKeyword.difficulty} />}
            </div>
            <p className="text-lg text-slate-700">{selectedKeyword.translation}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedKeyword.definitionEn && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Definition (EN)</p>
                  <p className="text-sm text-slate-700">{selectedKeyword.definitionEn}</p>
                </div>
              )}
              {selectedKeyword.definitionPl && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Definition (PL)</p>
                  <p className="text-sm text-slate-700">{selectedKeyword.definitionPl}</p>
                </div>
              )}
              {selectedKeyword.exampleEn && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Example (EN)</p>
                  <p className="text-sm italic text-slate-700">"{selectedKeyword.exampleEn}"</p>
                </div>
              )}
              {selectedKeyword.examplePl && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Example (PL)</p>
                  <p className="text-sm italic text-slate-700">"{selectedKeyword.examplePl}"</p>
                </div>
              )}
            </div>
            {selectedKeyword.collocations && (
              <div>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Collocations</p>
                {['commonCollocations', 'contexts', 'usagePatterns'].map(key => {
                  const items = selectedKeyword.collocations?.[key] || []
                  if (!items.length) return null
                  const label = key === 'commonCollocations' ? 'Common' : key === 'contexts' ? 'Contexts' : 'Usage Patterns'
                  return (
                    <div key={key} className="mb-3">
                      <p className="text-[11px] font-label font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">{label}</p>
                      <ul className="space-y-1">
                        {items.map((c, i) => (
                          <li key={i} className="text-sm text-slate-700">
                            <span className="font-semibold">{c.phrase}</span>
                            {c.example && <span className="text-slate-500 italic"> — "{c.example}"</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
            {selectedKeyword.lessonTitle && (
              <div className="rounded-[1rem] border border-sky-100 bg-sky-50/40 px-3 py-2">
                <p className="text-[11px] font-label text-slate-500">From lesson:</p>
                <p className="text-sm font-semibold text-slate-800">{selectedKeyword.lessonTitle}</p>
                {selectedKeyword.lessonDate && <p className="text-xs text-slate-500">{formatDate(selectedKeyword.lessonDate)}</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Metric Detail Modal — per-metric clinical deep dive */}
      <Modal
        open={!!selectedMetric}
        onClose={() => setSelectedMetric(null)}
        title={selectedMetric ? `${selectedMetric.metric.label} — ${selectedMetric.scope === 'lesson' ? (selectedMetric.analysis?.lessonTitle || 'Lesson') : 'Across All Lessons'}` : ''}
        widthClass="max-w-5xl"
      >
        {selectedMetric && (
          <MetricDetailContent
            metric={selectedMetric.metric}
            scope={selectedMetric.scope}
            focusAnalysis={selectedMetric.analysis}
            enrichedAnalyses={enrichedAnalyses}
            overallAssessment={overallAssessment}
            student={student}
          />
        )}
      </Modal>
    </div>
  )
}

/* ============================================================================
   MetricDetailContent — body of the metric deep-dive modal
   ============================================================================ */

function MetricDetailContent({ metric, scope, focusAnalysis, enrichedAnalyses, overallAssessment, student }) {
  const [highlightedAnalysisId, setHighlightedAnalysisId] = useState(null)

  function scrollToAndHighlight(analysisId) {
    if (!analysisId) return
    setHighlightedAnalysisId(null)
    setTimeout(() => {
      setHighlightedAnalysisId(analysisId)
      const el = document.querySelector(`[data-commentary-analysis="${analysisId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      setTimeout(() => setHighlightedAnalysisId(null), 2800)
    }, 30)
  }

  // Parse per-metric commentary if present in personalDetails (future-proofed)
  const parseCommentary = (analysis) => {
    if (!analysis?.personalDetails) return null
    for (const entry of analysis.personalDetails) {
      if (typeof entry !== 'string') continue
      const match = entry.match(/^metricCommentary:(.+)$/)
      if (match) {
        try {
          return JSON.parse(match[1])
        } catch { /* ignore */ }
      }
    }
    return null
  }

  // Filter key errors, strengths, improvements by metric category
  const filterByMetric = (items, kind) => {
    if (!items) return []
    const cats = metric.categories
    if (kind === 'keyErrors') {
      // keyErrors is array of { error, correction, category }
      return items.filter(e => !cats.length || cats.includes(String(e?.category || '').toLowerCase()))
    }
    // strengths/improvements are strings — match by keyword heuristic
    const keywords = {
      vocabularyRange: /vocab|lexi|collocat|register|word choice|idiom|phrase|discourse marker/i,
      grammaticalAccuracy: /grammar|tense|aspect|article|preposition|agreement|conditional|modal|relative|clause/i,
      fluencyAndCoherence: /fluen|hesit|pac|coheren|self-repair|filler|pause|discourse|linker/i,
      pronunciation: /pronunc|stress|intonation|phonem|sound|rhythm|schwa|vowel|consonant|IPA/i,
      communicativeEffectiveness: /communic|pragmat|register|polite|convey|clarif|negotiat|effectiv|nuanc|listener/i,
    }
    const rgx = keywords[metric.key]
    if (!rgx) return items
    return items.filter(s => rgx.test(String(s || '')))
  }

  if (scope === 'lesson' && focusAnalysis) {
    const commentary = parseCommentary(focusAnalysis)
    const val = Number(focusAnalysis[metric.key]) || 0
    const tier = scoreToTier(val)
    const relevantStrengths = filterByMetric(focusAnalysis.strengths, 'strengths')
    const relevantImprovements = filterByMetric(focusAnalysis.improvements, 'improvements')
    const relevantErrors = filterByMetric(focusAnalysis.keyErrors, 'keyErrors')
    const commentaryText = commentary?.[metric.key]

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="material-symbols-outlined text-3xl" style={{ color: metric.hue.stroke }}>{metric.icon}</span>
          <div>
            <p className="font-headline text-2xl text-slate-900">{Math.round(val)}/100</p>
            <p className={`font-label text-xs font-bold uppercase tracking-[0.18em] ${tier.color}`}>{tier.label}</p>
          </div>
          <span className="text-xs text-slate-400 ml-auto italic max-w-xs">{metric.description}</span>
        </div>

        {commentaryText ? (
          <div className="rounded-[1.25rem] border border-sky-100 bg-sky-50/40 px-4 py-3">
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 mb-2">Clinical Commentary — {metric.shortLabel}</p>
            <RichText text={commentaryText} />
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-slate-100 bg-slate-50/40 px-4 py-3">
            <p className="text-[11px] italic text-slate-500">
              Dedicated per-metric commentary is being generated for this lesson. Meanwhile, here are the lesson's observations filtered to this skill area.
            </p>
          </div>
        )}

        {relevantStrengths.length > 0 && (
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-2">Strengths Observed in This Skill</p>
            <ul className="space-y-1.5">
              {relevantStrengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                  <span className="material-symbols-outlined text-emerald-400 text-sm mt-0.5 shrink-0">check_circle</span>
                  <RichInline text={s} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {relevantImprovements.length > 0 && (
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-2">Improvement Targets in This Skill</p>
            <ul className="space-y-1.5">
              {relevantImprovements.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                  <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5 shrink-0">trending_up</span>
                  <RichInline text={s} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {relevantErrors.length > 0 && (
          <div>
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 mb-2">Key Errors Categorised Under This Skill</p>
            <div className="space-y-2">
              {relevantErrors.map((err, i) => (
                <div key={i} className="rounded-[1rem] border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs text-rose-700 italic leading-relaxed flex-1">"<SafeText value={err.error} />"</p>
                    {err.category && (
                      <span className="shrink-0 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600">{err.category}</span>
                    )}
                  </div>
                  {err.correction && (
                    <p className="mt-1 text-xs text-emerald-700 leading-relaxed">→ <SafeText value={err.correction} /></p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(relevantStrengths.length === 0 && relevantImprovements.length === 0 && relevantErrors.length === 0 && !commentaryText) && (
          <p className="text-sm text-slate-500 italic py-4 text-center">
            No skill-specific observations recorded for this metric in this lesson.
          </p>
        )}
      </div>
    )
  }

  // Overall scope — longitudinal view
  const allErrors = enrichedAnalyses.flatMap(a => (a.keyErrors || []).map(e => ({ ...e, lessonDate: a.lessonDate, lessonTitle: a.lessonTitle })))
  const filteredErrors = filterByMetric(allErrors, 'keyErrors')
  const allStrengths = enrichedAnalyses.flatMap(a => (a.strengths || []).map(s => ({ text: s, lessonDate: a.lessonDate, lessonTitle: a.lessonTitle })))
  const allImprovements = enrichedAnalyses.flatMap(a => (a.improvements || []).map(s => ({ text: s, lessonDate: a.lessonDate, lessonTitle: a.lessonTitle })))
  const relevantStrengths = allStrengths.filter(s => filterByMetric([s.text], 'strengths').length)
  const relevantImprovements = allImprovements.filter(s => filterByMetric([s.text], 'improvements').length)

  const currentVal = overallAssessment?.[metric.key] || 0
  const avgKey = `avg${metric.key.charAt(0).toUpperCase() + metric.key.slice(1)}`
  const avgVal = overallAssessment?.[avgKey] || 0
  const tier = scoreToTier(currentVal)

  // Aggregate commentary from all lessons
  const perLessonCommentary = enrichedAnalyses
    .map(a => {
      const commentary = parseCommentary(a)
      return commentary?.[metric.key] ? { analysisId: String(a._id || ''), date: a.lessonDate, title: a.lessonTitle, text: commentary[metric.key] } : null
    })
    .filter(Boolean)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="material-symbols-outlined text-3xl" style={{ color: metric.hue.stroke }}>{metric.icon}</span>
        <div>
          <p className="font-headline text-2xl text-slate-900">{Math.round(currentVal)}/100 <span className="text-sm text-slate-500 font-normal">latest</span></p>
          <p className={`font-label text-xs font-bold uppercase tracking-[0.18em] ${tier.color}`}>{tier.label} · rolling average {avgVal}</p>
        </div>
        <span className="text-xs text-slate-400 ml-auto italic max-w-xs">{metric.description}</span>
      </div>

      {/* Longitudinal chart */}
      {enrichedAnalyses.length > 1 && (
        <div className="rounded-[1.25rem] border border-slate-200 bg-white/60 px-4 py-3">
          <MetricLineChart
            metric={metric}
            analyses={enrichedAnalyses}
            onPointClick={(p) => scrollToAndHighlight(p.analysis?._id)}
          />
        </div>
      )}

      {/* Per-lesson commentary if present */}
      {perLessonCommentary.length > 0 && (
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 mb-2">Per-Lesson Commentary — {metric.shortLabel}</p>
          <p className="text-[11px] text-slate-400 mb-3 italic">Click any node on the chart above to jump to that lesson's commentary.</p>
          <div className="space-y-2">
            {perLessonCommentary.map((c) => (
              <div
                key={c.analysisId}
                data-commentary-analysis={c.analysisId}
                className={`rounded-[1rem] border border-slate-200 bg-slate-50/40 px-4 py-3 transition-colors ${highlightedAnalysisId === c.analysisId ? 'commentary-highlight' : ''}`}
              >
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">{formatDate(c.date)} · {c.title}</p>
                <RichText text={c.text} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring strengths for this metric */}
      {relevantStrengths.length > 0 && (
        <CollapsibleInner title={`Recurring Strengths in ${metric.shortLabel}`} iconColor="text-emerald-500" count={relevantStrengths.length}>
          <ul className="space-y-1.5">
            {relevantStrengths.slice(0, 12).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                <span className="material-symbols-outlined text-emerald-400 text-sm mt-0.5 shrink-0">check_circle</span>
                <div>
                  <span>{s.text}</span>
                  <span className="ml-2 text-[10px] text-slate-400">({formatDate(s.lessonDate)})</span>
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleInner>
      )}

      {relevantImprovements.length > 0 && (
        <CollapsibleInner title={`Recurring Improvements in ${metric.shortLabel}`} iconColor="text-amber-500" count={relevantImprovements.length}>
          <ul className="space-y-1.5">
            {relevantImprovements.slice(0, 12).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5 shrink-0">trending_up</span>
                <div>
                  <span>{s.text}</span>
                  <span className="ml-2 text-[10px] text-slate-400">({formatDate(s.lessonDate)})</span>
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleInner>
      )}

      {filteredErrors.length > 0 && (
        <CollapsibleInner title={`Key Errors Across All Lessons`} iconColor="text-rose-500" count={filteredErrors.length} defaultOpen={false}>
          <div className="space-y-2">
            {filteredErrors.slice(0, 25).map((err, i) => (
              <div key={i} className="rounded-[1rem] border border-slate-200 bg-slate-50/60 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs text-rose-700 italic leading-relaxed flex-1">"<SafeText value={err.error} />"</p>
                  <span className="shrink-0 text-[10px] font-label text-slate-400">{formatDate(err.lessonDate)}</span>
                </div>
                {err.correction && (
                  <p className="mt-1 text-xs text-emerald-700 leading-relaxed">→ <SafeText value={err.correction} /></p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleInner>
      )}

      {(relevantStrengths.length === 0 && relevantImprovements.length === 0 && filteredErrors.length === 0 && perLessonCommentary.length === 0) && (
        <p className="text-sm text-slate-500 italic py-4 text-center">
          No specific observations recorded for this metric yet — the clinical deep dive will populate as more lessons are graded.
        </p>
      )}
    </div>
  )
}

/* Nested collapsible used inside modals */
function CollapsibleInner({ title, children, count, iconColor = 'text-slate-500', defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-[1rem] border border-slate-200 bg-white/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 hover:bg-slate-50 transition cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">{title}</p>
          {count != null && <span className={`rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-label font-bold ${iconColor}`}>{count}</span>}
        </div>
        <span className={`material-symbols-outlined text-slate-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && <div className="border-t border-slate-100 px-3 py-3">{children}</div>}
    </div>
  )
}
