// Superadmin › Library — browse/filter/search the 330-deck course library.
//
// Data: GET /api/console/library (docs/console/API-CONTRACT.md, P1). This
// screen is browse + preview-link + PDF download; the assign/unassign UI and
// the Assignments view land in the next console slice.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { consoleGet, consoleGetBlob, saveBlob, libraryPdfPath } from './consoleApi.js'
import { ConsoleLoading, ConsoleNotLive, ConsoleErrorPanel, LevelBadge, BasketBadge } from './ConsoleStates.jsx'

const LEVELS = ['A2', 'B1', 'B2', 'C1']
const BASKETS = ['IDEAS', 'PLACES', 'SOCIETY', 'SPEC', 'SUM']
const PER = 50

function FilterPill({ active, onClick, children }) {
  return (
    <button type="button" className={`sa-btn ${active ? 'sa-btn-primary' : 'sa-btn-ghost'}`} onClick={onClick}>
      {children}
    </button>
  )
}

export default function SuperadminLibrary() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [level, setLevel] = useState('')
  const [basket, setBasket] = useState('')
  const [course, setCourse] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null) // { total, courses, rows }
  const [courseOptions, setCourseOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState(null)

  // Debounce the search box so we do not hammer the endpoint per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])

  // Any filter change restarts paging from the first page.
  useEffect(() => {
    setOffset(0)
  }, [debouncedQ, level, basket, course])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    consoleGet('/api/console/library', { q: debouncedQ, level, basket, course, per: PER, offset })
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) { setError(e); setData(null) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [debouncedQ, level, basket, course, offset, reloadKey])

  // Keep the widest course list we have seen so the dropdown stays complete
  // while filters narrow the response.
  useEffect(() => {
    const courses = data?.courses
    if (!Array.isArray(courses) || courses.length === 0) return
    setCourseOptions(prev => {
      const merged = new Map(prev.map(c => [c.course_id, c]))
      courses.forEach(c => merged.set(c.course_id, c))
      return Array.from(merged.values()).sort((a, b) => a.course_id.localeCompare(b.course_id))
    })
  }, [data])

  const rows = data?.rows || []
  const total = data?.total ?? 0
  const anyFilter = Boolean(debouncedQ || level || basket || course)

  function clearFilters() {
    setQ('')
    setLevel('')
    setBasket('')
    setCourse('')
  }

  async function downloadPdf(row) {
    setDownloadError(null)
    setDownloadingId(row.lesson_id)
    try {
      const blob = await consoleGetBlob(row.pdf_url || libraryPdfPath(row.lesson_id))
      saveBlob(blob, `${row.lesson_id}.pdf`)
    } catch (e) {
      setDownloadError(`PDF download for ${row.lesson_id} failed: ${e.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Course library{data ? ` · ${total} lessons` : ''}</h2>
          <input
            type="search"
            className="sa-input"
            placeholder="Search title / topics / keywords…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div className="sa-card-body">
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="sa-stat-label" style={{ minWidth: '3.5rem' }}>Level</span>
              <FilterPill active={level === ''} onClick={() => setLevel('')}>All</FilterPill>
              {LEVELS.map(l => (
                <FilterPill key={l} active={level === l} onClick={() => setLevel(l)}>{l}</FilterPill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sa-stat-label" style={{ minWidth: '3.5rem' }}>Basket</span>
              <FilterPill active={basket === ''} onClick={() => setBasket('')}>All</FilterPill>
              {BASKETS.map(b => (
                <FilterPill key={b} active={basket === b} onClick={() => setBasket(b)}>{b}</FilterPill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sa-stat-label" style={{ minWidth: '3.5rem' }}>Course</span>
              <select
                className="sa-input"
                value={course}
                onChange={e => setCourse(e.target.value)}
                style={{ maxWidth: 360, width: 'auto' }}
              >
                <option value="">All courses</option>
                {courseOptions.map(c => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_id} · {c.count} lessons
                  </option>
                ))}
              </select>
              {anyFilter && (
                <button
                  type="button"
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: 'rgba(148, 163, 184, 0.8)' }}
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {downloadError && <p className="mb-3 text-sm" style={{ color: '#fca5a5' }}>{downloadError}</p>}

          {loading && <ConsoleLoading label="Loading library…" />}
          {!loading && error && error.notLive && <ConsoleNotLive endpoint="GET /api/console/library" />}
          {!loading && error && !error.notLive && (
            <ConsoleErrorPanel error={error} onRetry={() => setReloadKey(k => k + 1)} />
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="p-4" style={{ color: 'rgba(148, 163, 184, 0.7)' }}>
              {anyFilter ? 'No lessons match these filters.' : 'The library index is empty.'}
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: 'rgba(148, 163, 184, 0.7)' }}>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Lesson</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Course</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Level</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Basket</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Topic</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Keywords</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Assigned</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const keywords = Array.isArray(row.keywords) ? row.keywords : []
                    return (
                      <tr key={row.lesson_id} className="border-t align-top" style={{ borderColor: 'rgba(148, 163, 184, 0.08)' }}>
                        <td className="px-3 py-3" style={{ minWidth: '16rem' }}>
                          <Link to={`/admin/superadmin/library/${encodeURIComponent(row.lesson_id)}`} className="font-semibold" style={{ color: '#f1f5f9' }}>
                            {row.title}
                          </Link>
                          <p className="mt-0.5 font-mono text-[11px]" style={{ color: 'rgba(148, 163, 184, 0.65)' }}>
                            {row.lesson_id}
                          </p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" style={{ color: 'rgba(203, 213, 225, 0.75)' }}>
                          {row.course_id}
                          {row.lesson_number != null && (
                            <span style={{ color: 'rgba(148, 163, 184, 0.6)' }}> · #{row.lesson_number}</span>
                          )}
                        </td>
                        <td className="px-3 py-3"><LevelBadge level={row.level} /></td>
                        <td className="px-3 py-3"><BasketBadge basket={row.basket} /></td>
                        <td className="px-3 py-3" style={{ color: 'rgba(203, 213, 225, 0.75)', maxWidth: '14rem' }}>
                          {row.topic || '—'}
                        </td>
                        <td className="px-3 py-3" style={{ maxWidth: '16rem' }}>
                          {keywords.length === 0 ? (
                            <span style={{ color: 'rgba(148, 163, 184, 0.5)' }}>—</span>
                          ) : (
                            <span style={{ color: 'rgba(203, 213, 225, 0.75)', fontSize: '0.78rem' }}>
                              {keywords.slice(0, 3).join(', ')}
                              {keywords.length > 3 && (
                                <span style={{ color: 'rgba(148, 163, 184, 0.6)' }}> +{keywords.length - 3}</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" style={{ color: row.assigned_count ? '#86efac' : 'rgba(148, 163, 184, 0.5)' }}>
                          {row.assigned_count ? `${row.assigned_count} assigned` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            {row.video_url && (
                              <a
                                href={row.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-bold uppercase tracking-widest"
                                style={{ color: 'rgba(203, 213, 225, 0.75)' }}
                              >
                                Video
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => downloadPdf(row)}
                              disabled={downloadingId === row.lesson_id}
                              className="text-[11px] font-bold uppercase tracking-widest"
                              style={{
                                color: '#7dd3fc',
                                opacity: downloadingId === row.lesson_id ? 0.5 : 1,
                                cursor: downloadingId === row.lesson_id ? 'wait' : 'pointer',
                              }}
                            >
                              {downloadingId === row.lesson_id ? 'PDF…' : 'PDF'}
                            </button>
                            <Link
                              to={`/admin/superadmin/library/${encodeURIComponent(row.lesson_id)}`}
                              className="text-[11px] font-bold uppercase tracking-widest"
                              style={{ color: '#a78bfa' }}
                            >
                              Preview →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && total > PER && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs" style={{ color: 'rgba(148, 163, 184, 0.7)' }}>
                Showing {offset + 1}–{offset + rows.length} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="sa-btn sa-btn-ghost"
                  disabled={offset === 0}
                  style={offset === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                  onClick={() => setOffset(Math.max(0, offset - PER))}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  className="sa-btn sa-btn-ghost"
                  disabled={offset + rows.length >= total}
                  style={offset + rows.length >= total ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                  onClick={() => setOffset(offset + PER)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
