// Superadmin › Assignments — who has which library deck, with unassign.
//
// Data: GET /api/console/assignments?student_slug=&course= (docs/console/
// API-CONTRACT.md, P1 Assignment). Rows carry source:"library" (assigned from
// the course library — unassignable here via POST /api/console/unassign) or
// source:"published" (legacy per-student lesson PDFs already in
// lesson-pdfs.json — listed for completeness, read-only here).
//
// The student filter reuses the existing Convex students query (same read the
// All Students screen does); course filter options are fed best-effort from
// GET /api/console/library's courses[] and the dropdown simply stays empty if
// that endpoint is not live. No mocked rows anywhere, per contract rule.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { consoleGet, consoleGetBlob, consolePost, saveBlob } from './consoleApi.js'
import { ConsoleLoading, ConsoleNotLive, ConsoleErrorPanel } from './ConsoleStates.jsx'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const SOURCE_STYLES = {
  library: { background: 'rgba(56, 189, 248, 0.16)', color: '#7dd3fc' },
  published: { background: 'rgba(148, 163, 184, 0.18)', color: '#cbd5e1' },
}

export default function SuperadminAssignments() {
  const [studentSlug, setStudentSlug] = useState('')
  const [course, setCourse] = useState('')
  const [data, setData] = useState(null) // { rows }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [students, setStudents] = useState([]) // Convex — filter options + display names
  const [courseOptions, setCourseOptions] = useState([]) // best-effort from the library endpoint

  const [unassignBusy, setUnassignBusy] = useState(null) // `${lesson_id}::${student_slug}`
  const [unassignError, setUnassignError] = useState(null)
  const [downloadingKey, setDownloadingKey] = useState(null)
  const [downloadError, setDownloadError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    consoleGet('/api/console/assignments', { student_slug: studentSlug, course })
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) { setError(e); setData(null) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [studentSlug, course, reloadKey])

  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listStudents', {})
      .then(d => { if (alive && Array.isArray(d)) setStudents(d) })
      .catch(() => {}) // filter degrades to "all students"; names fall back to slugs
    consoleGet('/api/console/library', { per: 1 })
      .then(d => { if (alive && Array.isArray(d?.courses)) setCourseOptions(d.courses) })
      .catch(() => {}) // course dropdown stays empty if the library endpoint is not live
    return () => { alive = false }
  }, [])

  const rows = data?.rows || []
  const nameBySlug = new Map(students.map(s => [s.slug, s.name]))
  const sortedStudents = students.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const anyFilter = Boolean(studentSlug || course)

  async function unassign(row) {
    const label = nameBySlug.get(row.student_slug) || row.student_slug
    const ok = window.confirm(
      `Unassign "${row.title || row.lesson_id}" from ${label}? The copied PDF stays on disk; the curriculum link is removed.`
    )
    if (!ok) return
    const key = `${row.lesson_id}::${row.student_slug}`
    setUnassignBusy(key)
    setUnassignError(null)
    try {
      const result = await consolePost('/api/console/unassign', {
        lesson_id: row.lesson_id,
        student_slug: row.student_slug,
      })
      if (!result?.ok) throw new Error('Backend answered without ok:true — check the audit log before retrying')
      setReloadKey(k => k + 1)
    } catch (e) {
      setUnassignError(e)
    } finally {
      setUnassignBusy(null)
    }
  }

  async function downloadPdf(row) {
    if (!row.pdf_url) return
    const key = `${row.lesson_id}::${row.student_slug}`
    setDownloadError(null)
    setDownloadingKey(key)
    try {
      const blob = await consoleGetBlob(row.pdf_url)
      saveBlob(blob, `${row.lesson_id}.pdf`)
    } catch (e) {
      setDownloadError(`PDF download for ${row.lesson_id} failed: ${e.message}`)
    } finally {
      setDownloadingKey(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Assignments{!loading && !error ? ` · ${rows.length}` : ''}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="sa-input"
              value={studentSlug}
              onChange={e => setStudentSlug(e.target.value)}
              style={{ maxWidth: 240, width: 'auto' }}
              aria-label="Filter by student"
            >
              <option value="">All students</option>
              {sortedStudents.map(s => (
                <option key={s.slug || s._id} value={s.slug}>
                  {s.name} ({s.slug})
                </option>
              ))}
            </select>
            <select
              className="sa-input"
              value={course}
              onChange={e => setCourse(e.target.value)}
              style={{ maxWidth: 240, width: 'auto' }}
              aria-label="Filter by course"
            >
              <option value="">All courses</option>
              {courseOptions.map(c => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_id}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="sa-card-body">
          {(downloadError || unassignError) && (
            <p className="mb-3 text-sm" style={{ color: '#fca5a5' }}>
              {downloadError || unassignError.message}
            </p>
          )}

          {loading && <ConsoleLoading label="Loading assignments…" />}
          {!loading && error && error.notLive && <ConsoleNotLive endpoint="GET /api/console/assignments" />}
          {!loading && error && !error.notLive && (
            <ConsoleErrorPanel error={error} onRetry={() => setReloadKey(k => k + 1)} />
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="p-4" style={{ color: 'rgba(148, 163, 184, 0.7)' }}>
              {anyFilter ? 'No assignments match these filters.' : 'Nothing has been assigned from the library yet.'}
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: 'rgba(148, 163, 184, 0.7)' }}>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Lesson</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Student</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Lesson date</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Source</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const busyKey = `${row.lesson_id}::${row.student_slug}`
                    return (
                      <tr
                        key={`${busyKey}::${i}`}
                        className="border-t align-top"
                        style={{ borderColor: 'rgba(148, 163, 184, 0.08)' }}
                      >
                        <td className="px-3 py-3" style={{ minWidth: '16rem' }}>
                          <Link
                            to={`/admin/superadmin/library/${encodeURIComponent(row.lesson_id)}`}
                            className="font-semibold"
                            style={{ color: '#f1f5f9' }}
                          >
                            {row.title || row.lesson_id}
                          </Link>
                          <p className="mt-0.5 font-mono text-[11px]" style={{ color: 'rgba(148, 163, 184, 0.65)' }}>
                            {row.lesson_id}
                          </p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" style={{ color: '#e2e8f0' }}>
                          {nameBySlug.get(row.student_slug) || row.student_slug}
                          {nameBySlug.has(row.student_slug) && (
                            <p className="mt-0.5 font-mono text-[11px]" style={{ color: 'rgba(148, 163, 184, 0.65)' }}>
                              {row.student_slug}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" style={{ color: 'rgba(203, 213, 225, 0.75)' }}>
                          {row.date || '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span className="sa-badge" style={SOURCE_STYLES[row.source] || SOURCE_STYLES.published}>
                            {row.source || '?'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            {row.pdf_url && (
                              <button
                                type="button"
                                onClick={() => downloadPdf(row)}
                                disabled={downloadingKey === busyKey}
                                className="text-[11px] font-bold uppercase tracking-widest"
                                style={{
                                  color: '#7dd3fc',
                                  opacity: downloadingKey === busyKey ? 0.5 : 1,
                                  cursor: downloadingKey === busyKey ? 'wait' : 'pointer',
                                }}
                              >
                                {downloadingKey === busyKey ? 'PDF…' : 'PDF'}
                              </button>
                            )}
                            {row.source === 'library' && (
                              <button
                                type="button"
                                onClick={() => unassign(row)}
                                disabled={unassignBusy === busyKey}
                                className="text-[11px] font-bold uppercase tracking-widest"
                                style={{
                                  color: '#fca5a5',
                                  opacity: unassignBusy === busyKey ? 0.5 : 1,
                                  cursor: unassignBusy === busyKey ? 'wait' : 'pointer',
                                }}
                              >
                                {unassignBusy === busyKey ? 'Removing…' : 'Unassign'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
