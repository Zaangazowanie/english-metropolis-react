import { useState, useEffect, useMemo } from 'react'

/* ============================================================================
   Shared analytics primitives — used by both admin and student panels
   ============================================================================ */

export const METRICS = [
  {
    key: 'vocabularyRange',
    label: 'Vocabulary Range',
    shortLabel: 'Vocabulary',
    icon: 'book',
    description: 'Breadth and precision of lexical resources, including collocations, idioms, and register.',
    studentDescription: 'How many different words you can use and how precisely you use them.',
    categories: ['vocabulary', 'collocation'],
    hue: { stroke: '#0891b2', fill: 'rgba(8, 145, 178, 0.08)', soft: '#cffafe', textDark: '#0e7490' },
  },
  {
    key: 'grammaticalAccuracy',
    label: 'Grammatical Accuracy',
    shortLabel: 'Grammar',
    icon: 'spellcheck',
    description: 'Consistency and complexity of grammatical structures used under pressure.',
    studentDescription: 'How reliably you build correct sentences, even complex ones.',
    categories: ['grammar'],
    hue: { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.08)', soft: '#ede9fe', textDark: '#6d28d9' },
  },
  {
    key: 'fluencyAndCoherence',
    label: 'Fluency & Coherence',
    shortLabel: 'Fluency',
    icon: 'graphic_eq',
    description: 'Speech pacing, coherent organisation of extended turns, and minimal hesitation.',
    studentDescription: 'How smoothly and naturally you speak with few pauses.',
    categories: [],
    hue: { stroke: '#059669', fill: 'rgba(5, 150, 105, 0.08)', soft: '#d1fae5', textDark: '#047857' },
  },
  {
    key: 'pronunciation',
    label: 'Pronunciation',
    shortLabel: 'Pronunciation',
    icon: 'record_voice_over',
    description: 'Intelligibility, word stress, sentence rhythm, and phonemic accuracy.',
    studentDescription: 'How clearly and accurately you pronounce sounds and words.',
    categories: ['pronunciation'],
    hue: { stroke: '#d97706', fill: 'rgba(217, 119, 6, 0.08)', soft: '#fef3c7', textDark: '#b45309' },
  },
  {
    key: 'communicativeEffectiveness',
    label: 'Communicative Effectiveness',
    shortLabel: 'Communication',
    icon: 'forum',
    description: 'Ability to convey intended meaning, negotiate sense, and respond appropriately.',
    studentDescription: 'How well you get your message across and respond in conversations.',
    categories: ['pragmatics', 'register'],
    hue: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.08)', soft: '#dbeafe', textDark: '#1d4ed8' },
  },
]

export function scoreToTier(value) {
  if (value >= 85) return { label: 'Advanced', color: 'text-emerald-600', bar: 'bg-emerald-400', soft: 'bg-emerald-50', border: 'border-emerald-200' }
  if (value >= 70) return { label: 'Consolidating', color: 'text-sky-600', bar: 'bg-sky-400', soft: 'bg-sky-50', border: 'border-sky-200' }
  if (value >= 55) return { label: 'Developing', color: 'text-amber-600', bar: 'bg-amber-400', soft: 'bg-amber-50', border: 'border-amber-200' }
  return { label: 'Emerging', color: 'text-rose-600', bar: 'bg-rose-400', soft: 'bg-rose-50', border: 'border-rose-200' }
}

/* ============================================================================
   Date formatting
   ============================================================================ */

export function formatDate(value) {
  if (!value) return 'N/A'
  if (typeof value === 'number') {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
  }
  const d = new Date(`${value}T12:00:00`)
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

export function formatLongDate(value) {
  if (!value) return 'N/A'
  const d = typeof value === 'number' ? new Date(value) : new Date(`${value}T12:00:00`)
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d)
}

/* ============================================================================
   CefrBadge — reusable CEFR pill
   ============================================================================ */

export function CefrBadge({ band, score, size = 'md' }) {
  const colors = {
    A1: 'bg-red-100 text-red-700 border-red-200',
    A2: 'bg-orange-100 text-orange-700 border-orange-200',
    B1: 'bg-amber-100 text-amber-700 border-amber-200',
    B2: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    C1: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    C2: 'bg-sky-100 text-sky-700 border-sky-200',
  }
  const cls = colors[band] || 'bg-slate-100 text-slate-700 border-slate-200'
  const sizeCls = size === 'lg' ? 'px-3.5 py-1.5 text-sm tracking-[0.18em]' : 'px-2.5 py-1 text-xs tracking-[0.16em]'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-label font-bold uppercase ${sizeCls} ${cls}`}>
      {band}{score ? ` ${Math.round(score)}` : ''}
    </span>
  )
}

/* ============================================================================
   RichText — auto-formats clinical analysis prose for readability
   ============================================================================ */

const LINGUISTIC_KEYWORDS = /\b(present perfect(?: continuous)?|past perfect(?: continuous)?|past simple|past continuous|present simple|present continuous|future perfect|past modals?|past conditional|first conditional|second conditional|third conditional|mixed conditional|conditional|subjunctive|reported speech|passive voice|causative|relative clauses?|defining relative|non-defining relative|phrasal verbs?|collocations?|articles?|definite article|indefinite article|prepositions?|modals?|quasi-modals?|gerunds?|infinitives?|to-infinitive|bare infinitive|participles?|past participle|subject-verb agreement|schwa|IPA|stress pattern|word stress|sentence stress|intonation|rising tone|falling tone|aspect|aspectual|tense|countable|uncountable|mass noun|discourse markers?|fillers?|hedges?|self-repair|register|pragmatics?|pragmatic|productive range|receptive range|C1|C2|B1|B2|A1|A2|CEFR|lexis|lexical|morphology|morphological|syntax|syntactic|phonemic|phonological|pronunciation|fluency|coherence|hesitat[a-z]*|collocat[a-z]*)\b/g

const IPA_PATTERN = /(\/[^\/\n]{1,30}\/)/g
const CEFR_BAND_PATTERN = /\b([ABC][12])\b(?!\s*\()/g
const SCORE_PATTERN = /\b(\d{2,3})\/100\b/g
const ARROW_PATTERN = /\s→\s/g

export function splitIntoParagraphs(text) {
  if (text.includes('\n\n')) return text.split(/\n\n+/).filter(s => s.trim())
  const sentences = text.match(/[^.!?]+[.!?]+(?:['")]*)?(?:\s|$)/g) || [text]
  if (sentences.length <= 2) return [text]
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

export function renderFormattedInline(text, keySeed = 'span') {
  if (!text || typeof text !== 'string') return text
  const tokens = []
  let counter = 0
  const nextToken = (node) => {
    const k = `§§${counter++}§§`
    tokens.push({ key: k, node })
    return k
  }

  let work = text
  work = work.replace(/"([^"]{2,200})"/g, (m, inner) => nextToken(
    <span className="font-mono italic text-sky-700 bg-sky-50/60 rounded px-1 py-0.5 text-[0.92em]">"{inner}"</span>
  ))
  work = work.replace(/'([^'\n]{2,200})'/g, (m, inner) => nextToken(
    <span className="font-mono italic text-sky-700 bg-sky-50/60 rounded px-1 py-0.5 text-[0.92em]">'{inner}'</span>
  ))
  work = work.replace(IPA_PATTERN, (m) => nextToken(
    <span className="font-mono text-violet-700 bg-violet-50/60 rounded px-1">{m}</span>
  ))
  work = work.replace(SCORE_PATTERN, (m, n) => nextToken(
    <span className="font-semibold text-slate-800 tabular-nums">{n}/100</span>
  ))
  work = work.replace(CEFR_BAND_PATTERN, (m, band) => nextToken(
    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[0.8em] font-label font-bold text-emerald-700 tracking-[0.08em]">{band}</span>
  ))
  work = work.replace(LINGUISTIC_KEYWORDS, (m) => nextToken(
    <span className="font-semibold text-slate-800">{m}</span>
  ))
  work = work.replace(ARROW_PATTERN, () => nextToken(
    <span className="mx-1 text-emerald-600 font-bold">→</span>
  ))

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

export function RichText({ text, className = '', paragraphClassName = '' }) {
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

export function RichInline({ text }) {
  if (text == null) return null
  const str = typeof text === 'string' ? text : (typeof text === 'object' ? JSON.stringify(text) : String(text))
  return <>{renderFormattedInline(str)}</>
}

/* ============================================================================
   MetricLineChart — SVG longitudinal chart
   ============================================================================ */

export function MetricLineChart({ metric, analyses, height = 180, onPointClick = null, compact = false }) {
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
  const pad = { top: compact ? 12 : 20, right: 24, bottom: compact ? 24 : 32, left: compact ? 28 : 34 }
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
      {!compact && (
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
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto metric-chart" preserveAspectRatio="xMidYMid meet">
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
        {[0, Math.floor(series.length / 2), series.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => {
          const p = points[i]
          return (
            <text key={i} x={p.x} y={height - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {formatDate(p.date)}
            </text>
          )
        })}
        <path d={areaPath} fill={metric.hue.fill} className="metric-area" />
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
        {points.map((p, i) => (
          <g
            key={i}
            className="metric-point"
            style={{ animationDelay: `${1200 + i * 80}ms` }}
            onClick={(e) => { e.stopPropagation(); if (onPointClick) onPointClick(p) }}
            role={onPointClick ? 'button' : undefined}
            aria-label={onPointClick ? `Open ${formatDate(p.date)} lesson` : undefined}
            style={{ outline: 'none' }}
          >
            {/* Generous 20px hit target, explicit pointer-events all */}
            <circle
              cx={p.x} cy={p.y} r="20"
              fill="rgba(255,255,255,0.001)"
              style={{ pointerEvents: onPointClick ? 'all' : 'none', cursor: onPointClick ? 'pointer' : 'default' }}
            />
            <circle cx={p.x} cy={p.y} r="5" fill="white" stroke={metric.hue.stroke} strokeWidth="2.5" pointerEvents="none" />
            <circle cx={p.x} cy={p.y} r="2" fill={metric.hue.stroke} pointerEvents="none" />
            <title>{`${formatDate(p.date)} · ${Math.round(p.value)}/100 · ${p.title}`}</title>
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ============================================================================
   MetricRadarChart — pentagon radar showing all 5 metrics at once
   ============================================================================ */

export function MetricRadarChart({ scores, size = 280, onMetricClick = null, label = '' }) {
  // scores is { vocabularyRange, grammaticalAccuracy, ... }
  const center = size / 2
  const radius = size * 0.38
  const levels = 4 // grid rings
  const angleStep = (Math.PI * 2) / METRICS.length

  const pointAt = (metricIdx, value) => {
    const angle = -Math.PI / 2 + metricIdx * angleStep
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r }
  }

  const polygonPoints = METRICS.map((m, i) => {
    const p = pointAt(i, scores?.[m.key] || 0)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')

  const labelAt = (metricIdx) => {
    const angle = -Math.PI / 2 + metricIdx * angleStep
    const r = radius + 22
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto radar-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 0.35)" />
          <stop offset="100%" stopColor="rgba(124, 58, 237, 0.25)" />
        </linearGradient>
      </defs>
      {/* Grid rings */}
      {Array.from({ length: levels }).map((_, i) => {
        const r = radius * ((i + 1) / levels)
        const pts = METRICS.map((m, j) => {
          const angle = -Math.PI / 2 + j * angleStep
          return `${(center + Math.cos(angle) * r).toFixed(1)},${(center + Math.sin(angle) * r).toFixed(1)}`
        }).join(' ')
        return <polygon key={i} points={pts} fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray={i === levels - 1 ? '' : '2,3'} />
      })}
      {/* Spokes */}
      {METRICS.map((m, i) => {
        const angle = -Math.PI / 2 + i * angleStep
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + Math.cos(angle) * radius}
            y2={center + Math.sin(angle) * radius}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        )
      })}
      {/* Data polygon */}
      <polygon
        points={polygonPoints}
        fill="url(#radarFill)"
        stroke="#2563eb"
        strokeWidth="2"
        strokeLinejoin="round"
        className="radar-polygon"
      />
      {/* Labels rendered before points so points paint on top + capture clicks */}
      {METRICS.map((m, i) => {
        const pos = labelAt(i)
        const anchor = pos.x < center - 10 ? 'end' : pos.x > center + 10 ? 'start' : 'middle'
        return (
          <g key={`lbl-${m.key}`} className="radar-label" style={{ animationDelay: `${1500 + i * 80}ms` }}>
            <text x={pos.x} y={pos.y - 4} textAnchor={anchor} fontSize="10" className="font-label" fontWeight="700" fill={m.hue.stroke}>
              {m.shortLabel.toUpperCase()}
            </text>
            <text x={pos.x} y={pos.y + 9} textAnchor={anchor} fontSize="11" className="font-body" fontWeight="700" fill="#0f172a">
              {Math.round(scores?.[m.key] || 0)}
            </text>
          </g>
        )
      })}
      {/* Data points — rendered LAST so they're on top of labels for pointer events */}
      {METRICS.map((m, i) => {
        const p = pointAt(i, scores?.[m.key] || 0)
        return (
          <g
            key={m.key}
            className="radar-point"
            style={{ animationDelay: `${900 + i * 120}ms` }}
            onClick={(e) => { e.stopPropagation(); if (onMetricClick) onMetricClick(m) }}
            role={onMetricClick ? 'button' : undefined}
            aria-label={onMetricClick ? `Open ${m.label} deep dive` : undefined}
            style={{ outline: 'none' }}
          >
            {/* Oversized invisible hit target — generous 18px radius for easy clicking */}
            <circle cx={p.x} cy={p.y} r="18" fill="rgba(255,255,255,0.001)" style={{ pointerEvents: onMetricClick ? 'all' : 'none', cursor: onMetricClick ? 'pointer' : 'default' }} />
            <circle cx={p.x} cy={p.y} r="5" fill="white" stroke={m.hue.stroke} strokeWidth="2.5" pointerEvents="none" />
            <circle cx={p.x} cy={p.y} r="2" fill={m.hue.stroke} pointerEvents="none" />
          </g>
        )
      })}
    </svg>
  )
}

/* ============================================================================
   Modal — reusable glass modal
   ============================================================================ */

export function Modal({ open, onClose, title, children, widthClass = 'max-w-4xl' }) {
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
   Parse per-metric commentary from personalDetails JSON blob
   ============================================================================ */

export function parseMetricCommentary(analysis) {
  if (!analysis?.personalDetails) return null
  for (const entry of analysis.personalDetails) {
    if (typeof entry !== 'string') continue
    const match = entry.match(/^metricCommentary:(.+)$/)
    if (match) {
      try { return JSON.parse(match[1]) } catch { /* ignore */ }
    }
  }
  return null
}
