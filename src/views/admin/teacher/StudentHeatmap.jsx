// StudentHeatmap.jsx — teacher dashboard per-student keyword heatmap.
//
// Phase 3 of audit §4 #21 (Mike CRITICAL). Authored 2026-05-02 by Ricky.
//
// Renders the entire keyword bank for one student as a coloured grid:
//   - untouched (grey)   = never shown to the student
//   - fresh (cyan)       = seen <3x AND in the last 7 days
//   - familiar (green)   = seen 3+ times AND no recent errors
//   - stuck (rose)       = seen 3+ times BUT recent errors / not retained
//
// Backed by Convex query `students:keywordHeatmap`. Adds:
//   - filter by topic / CEFR
//   - sort by lastSeenDaysAgo / seenCount / bucket / keyword
//   - bilingual headers (EN / PL via useI18n)
//   - search box
//   - Export CSV
//
// Mounted at /admin/superadmin/students/:slug/heatmap (registered in
// src/main.jsx under SuperadminLayout). Uses the existing
// queryAdminConvex auth pattern.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { useI18n } from '../../../i18n'

const BUCKETS = [
  { key: 'untouched', enLabel: 'Untouched', plLabel: 'Nieruszone',     color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.32)' },
  { key: 'fresh',     enLabel: 'Fresh',     plLabel: 'Świeże',          color: '#22d3ee', bg: 'rgba(34,211,238,0.14)',  border: 'rgba(34,211,238,0.4)' },
  { key: 'familiar',  enLabel: 'Familiar',  plLabel: 'Znajome',         color: '#4ade80', bg: 'rgba(74,222,128,0.14)',  border: 'rgba(74,222,128,0.42)' },
  { key: 'stuck',     enLabel: 'Stuck',     plLabel: 'Utknęły',         color: '#f43f5e', bg: 'rgba(244,63,94,0.14)',   border: 'rgba(244,63,94,0.42)' },
]

const BUCKET_BY_KEY = Object.fromEntries(BUCKETS.map(b => [b.key, b]))

function bilingual(lang, en, pl) { return lang === 'pl' ? pl : en }

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function StudentHeatmap() {
  const { slug = '' } = useParams()
  const { lang } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [topicFilter, setTopicFilter] = useState('all')
  const [cefrFilter, setCefrFilter] = useState('all')
  const [bucketFilter, setBucketFilter] = useState('all')
  const [sortKey, setSortKey] = useState('bucket')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    if (!slug) return
    let alive = true
    setLoading(true)
    setError(null)
    queryAdminConvex('students:keywordHeatmap', { studentSlug: slug })
      .then(d => { if (alive) { setData(d); setLoading(false) } })
      .catch(e => { if (alive) { setError(e.message || String(e)); setLoading(false) } })
    return () => { alive = false }
  }, [slug])

  const rows = data?.rows ?? []

  const topics = useMemo(() => {
    const set = new Set()
    for (const r of rows) if (r.topic) set.add(r.topic)
    return Array.from(set).sort()
  }, [rows])

  const cefrs = useMemo(() => {
    const set = new Set()
    for (const r of rows) if (r.cefr) set.add(r.cefr)
    return Array.from(set).sort()
  }, [rows])

  const counts = useMemo(() => {
    const out = { untouched: 0, fresh: 0, familiar: 0, stuck: 0 }
    for (const r of rows) out[r.bucket] = (out[r.bucket] || 0) + 1
    return out
  }, [rows])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter(r => {
      if (needle && !r.keyword.toLowerCase().includes(needle)) return false
      if (topicFilter !== 'all' && r.topic !== topicFilter) return false
      if (cefrFilter !== 'all' && r.cefr !== cefrFilter) return false
      if (bucketFilter !== 'all' && r.bucket !== bucketFilter) return false
      return true
    })
  }, [rows, search, topicFilter, cefrFilter, bucketFilter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    const bucketOrder = { stuck: 0, fresh: 1, untouched: 2, familiar: 3 }
    copy.sort((a, b) => {
      let av, bv
      switch (sortKey) {
        case 'keyword':
          return a.keyword.localeCompare(b.keyword) * dir
        case 'seenCount':
          av = a.seenCount; bv = b.seenCount; break
        case 'lastSeenDaysAgo':
          // null (never seen) sorts to the bottom in asc, top in desc.
          av = a.lastSeenDaysAgo == null ? Number.POSITIVE_INFINITY : a.lastSeenDaysAgo
          bv = b.lastSeenDaysAgo == null ? Number.POSITIVE_INFINITY : b.lastSeenDaysAgo
          break
        case 'bucket':
        default:
          av = bucketOrder[a.bucket] ?? 99
          bv = bucketOrder[b.bucket] ?? 99
      }
      return (av - bv) * dir
    })
    return copy
  }, [filtered, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortKey(key); setSortDir('asc')
  }

  function exportCsv() {
    const header = ['keyword', 'cefr', 'topic', 'seenCount', 'lastSeenDaysAgo', 'correctnessRate', 'bucket']
    const body = sorted.map(r => [
      r.keyword,
      r.cefr,
      r.topic,
      r.seenCount,
      r.lastSeenDaysAgo == null ? '' : r.lastSeenDaysAgo,
      r.correctnessRate == null ? '' : r.correctnessRate.toFixed(3),
      r.bucket,
    ])
    downloadCsv(`heatmap-${slug || 'student'}.csv`, [header, ...body])
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: 'rgba(216,180,254,0.85)' }}>
            {bilingual(lang, 'Keyword heatmap', 'Mapa cieplna słów')}
          </p>
          <h1 className="text-xl font-bold" style={{ color: '#f8fafc' }}>{slug}</h1>
          <p className="text-xs mt-1" style={{ color: 'rgba(148,163,184,0.7)' }}>
            {bilingual(lang, 'Per-keyword exposure across the student\'s bank', 'Ekspozycja każdego słowa w banku ucznia')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/superadmin/students"
            className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: '#a78bfa' }}
          >
            ← {bilingual(lang, 'All students', 'Wszyscy uczniowie')}
          </Link>
          <button type="button" onClick={exportCsv} className="sa-btn sa-btn-ghost" disabled={!sorted.length}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            {bilingual(lang, 'Export CSV', 'Eksport CSV')}
          </button>
        </div>
      </div>

      {/* Bucket summary row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUCKETS.map(b => (
          <button
            type="button"
            key={b.key}
            onClick={() => setBucketFilter(prev => prev === b.key ? 'all' : b.key)}
            className="sa-card text-left"
            style={{
              borderColor: bucketFilter === b.key ? b.border : undefined,
              boxShadow: bucketFilter === b.key ? `0 0 0 2px ${b.border} inset` : undefined,
              cursor: 'pointer',
            }}
          >
            <div className="sa-card-body">
              <p className="sa-stat-label" style={{ color: b.color }}>{bilingual(lang, b.enLabel, b.plLabel)}</p>
              <p className="sa-stat-value">{counts[b.key] ?? 0}</p>
              <p className="text-[10px] mt-1" style={{ color: 'rgba(148,163,184,0.6)' }}>
                {b.key === 'untouched' && bilingual(lang, 'never shown', 'nigdy nie pokazane')}
                {b.key === 'fresh' && bilingual(lang, '<3x, last 7d', '<3x, ostatnie 7 dni')}
                {b.key === 'familiar' && bilingual(lang, '3+x, no errors', '3+x, bez błędów')}
                {b.key === 'stuck' && bilingual(lang, '3+x, errors / stale', '3+x, błędy / przestarzałe')}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="sa-card">
        <div className="sa-card-body grid gap-3 sm:grid-cols-4">
          <div>
            <p className="sa-stat-label">{bilingual(lang, 'Search', 'Szukaj')}</p>
            <input
              type="search"
              className="sa-input"
              placeholder={bilingual(lang, 'keyword…', 'słowo…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <p className="sa-stat-label">{bilingual(lang, 'Topic', 'Temat')}</p>
            <select className="sa-input" value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
              <option value="all">{bilingual(lang, 'All topics', 'Wszystkie tematy')}</option>
              {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className="sa-stat-label">CEFR</p>
            <select className="sa-input" value={cefrFilter} onChange={e => setCefrFilter(e.target.value)}>
              <option value="all">{bilingual(lang, 'All levels', 'Wszystkie poziomy')}</option>
              {cefrs.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <p className="sa-stat-label">{bilingual(lang, 'Bucket', 'Kategoria')}</p>
            <select className="sa-input" value={bucketFilter} onChange={e => setBucketFilter(e.target.value)}>
              <option value="all">{bilingual(lang, 'All', 'Wszystkie')}</option>
              {BUCKETS.map(b => (
                <option key={b.key} value={b.key}>{bilingual(lang, b.enLabel, b.plLabel)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Heatmap grid */}
      {loading && <div className="sa-card"><div className="sa-card-body">{bilingual(lang, 'Loading…', 'Ładowanie…')}</div></div>}
      {error && <div className="sa-card"><div className="sa-card-body" style={{ color: '#fca5a5' }}>Error: {error}</div></div>}
      {!loading && !error && (
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>
              {bilingual(lang, 'Bank', 'Bank')} · {data?.bankSize ?? 0} · {bilingual(lang, 'showing', 'pokazano')} {sorted.length}
            </h2>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.7)' }}>
              <span>{bilingual(lang, 'Sort:', 'Sortuj:')}</span>
              {[
                { k: 'bucket', en: 'Bucket', pl: 'Kategoria' },
                { k: 'lastSeenDaysAgo', en: 'Last seen', pl: 'Ostatnio' },
                { k: 'seenCount', en: 'Count', pl: 'Liczba' },
                { k: 'keyword', en: 'A→Z', pl: 'A→Z' },
              ].map(s => (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => toggleSort(s.k)}
                  className="sa-btn sa-btn-ghost"
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.6rem',
                    color: sortKey === s.k ? '#0b1220' : '#e2e8f0',
                    background: sortKey === s.k ? 'linear-gradient(135deg,#c4b5fd,#7dd3fc)' : 'rgba(148,163,184,0.1)',
                  }}
                >
                  {bilingual(lang, s.en, s.pl)} {sortKey === s.k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="sa-card-body">
            {sorted.length === 0 ? (
              <p style={{ color: 'rgba(148,163,184,0.7)' }}>
                {bilingual(lang, 'No keywords match the current filters.', 'Brak słów pasujących do filtrów.')}
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '0.5rem',
                }}
              >
                {sorted.map(r => {
                  const b = BUCKET_BY_KEY[r.bucket] ?? BUCKET_BY_KEY.untouched
                  const lastSeenLabel =
                    r.lastSeenDaysAgo == null
                      ? bilingual(lang, 'never', 'nigdy')
                      : r.lastSeenDaysAgo === 0
                        ? bilingual(lang, 'today', 'dziś')
                        : `${r.lastSeenDaysAgo}${bilingual(lang, 'd ago', 'd temu')}`
                  const correctnessLabel =
                    r.correctnessRate == null
                      ? '—'
                      : `${Math.round(r.correctnessRate * 100)}%`
                  return (
                    <div
                      key={r.keyword}
                      title={`${r.keyword} · ${r.bucket} · ${r.seenCount}x · ${lastSeenLabel}`}
                      style={{
                        background: b.bg,
                        border: `1px solid ${b.border}`,
                        borderRadius: '0.65rem',
                        padding: '0.6rem 0.7rem',
                        color: '#f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem',
                        minHeight: 78,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.15 }}>{r.keyword}</span>
                        {r.cefr && (
                          <span style={{
                            fontSize: '0.55rem',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            padding: '0.1rem 0.3rem',
                            borderRadius: 999,
                            background: 'rgba(15,23,42,0.5)',
                            color: 'rgba(203,213,225,0.85)',
                          }}>{r.cefr}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1" style={{ fontSize: '0.6rem', color: b.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.color, display: 'inline-block' }} />
                        {bilingual(lang, b.enLabel, b.plLabel)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(203,213,225,0.7)' }}>
                        {r.seenCount}× · {lastSeenLabel}
                        {r.correctnessRate != null && (
                          <> · {correctnessLabel}</>
                        )}
                      </div>
                      {r.topic && (
                        <div style={{ fontSize: '0.6rem', color: 'rgba(148,163,184,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.topic}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
