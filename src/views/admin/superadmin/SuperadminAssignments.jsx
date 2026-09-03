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
import { ConsoleEmpty, ConsoleSkeleton, ConsoleNotLive, ConsoleErrorPanel } from './ConsoleStates.jsx'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const SOURCE_STYLES = {
  library: { background: 'var(--sa-violet-100)', color: 'var(--sa-violet-600)' },
  published: { background: 'var(--sa-surface-soft)', color: 'var(--sa-text-muted)' },
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
      <div className="sa-page-header">
        <div>
          <h1>Assignments</h1>
          <p>Every lesson assigned to every student: library decks and published lessons, with the PDF each student can open.</p>
        </div>
      </div>
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Assignments{!loading && !error ? ` · ${rows.length}` : ''}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="sa-select"
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
              className="sa-select"
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
        <div className="sa-card-body p-0">
          {(downloadError || unassignError) && (
            <p className="p-4 text-sm" style={{ color: 'var(--sa-bad)' }}>
              {downloadError || unassignError.message}
            </p>
          )}

          {loading && <ConsoleSkeleton rows={8} />}
          {!loading && error && error.notLive && <ConsoleNotLive endpoint="GET /api/console/assignments" />}
          {!loading && error && !error.notLive && (
            <ConsoleErrorPanel error={error} onRetry={() => setReloadKey(k => k + 1)} />
          )}

          {!loading && !error && rows.length === 0 && (
            <ConsoleEmpty
              icon="assignment"
              title={anyFilter ? 'No assignments match these filters.' : 'Nothing has been assigned from the library yet.'}
            />
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Lesson</th>
                    <th>Student</th>
                    <th>Lesson date</th>
                    <th>Source</th>
                    <th className="sa-td-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const busyKey = `${row.lesson_id}::${row.student_slug}`
                    return (
                      <tr key={`${busyKey}::${i}`}>
                        <td style={{ minWidth: '16rem' }}>
                          <Link
                            to={`/admin/superadmin/curriculum/library/${encodeURIComponent(row.lesson_id)}`}
                            className="font-semibold"
                            style={{ color: 'var(--sa-text)' }}
                          >
                            {row.title || row.lesson_id}
                          </Link>
                          <p
                            className="mt-0.5 font-mono"
                            style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-micro)' }}
                          >
                            {row.lesson_id}
                          </p>
                        </td>
                        <td className="whitespace-nowrap" style={{ color: 'var(--sa-text)' }}>
                          {nameBySlug.get(row.student_slug) || row.student_slug}
                          {nameBySlug.has(row.student_slug) && (
                            <p
                              className="mt-0.5 font-mono"
                              style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-micro)' }}
                            >
                              {row.student_slug}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap" style={{ color: 'var(--sa-text-muted)' }}>
                          {row.date || '—'}
                        </td>
                        <td>
                          <span className="sa-badge" style={SOURCE_STYLES[row.source] || SOURCE_STYLES.published}>
                            {row.source || '?'}
                          </span>
                        </td>
                        <td className="sa-td-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {row.pdf_url && (
                              <button
                                type="button"
                                onClick={() => downloadPdf(row)}
                                disabled={downloadingKey === busyKey}
                                className="sa-btn sa-btn-sm sa-btn-ghost"
                                style={downloadingKey === busyKey ? { cursor: 'wait' } : undefined}
                              >
                                {downloadingKey === busyKey ? 'PDF…' : 'PDF'}
                              </button>
                            )}
                            {row.source === 'library' && (
                              <button
                                type="button"
                                onClick={() => unassign(row)}
                                disabled={unassignBusy === busyKey}
                                className="sa-btn sa-btn-sm sa-btn-danger"
                                style={unassignBusy === busyKey ? { cursor: 'wait' } : undefined}
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
