// TeacherMaterials — "Materials": browse & download lesson material (P2, slice 2).
//
// GET /api/console/teacher/materials?student_slug= (docs/console/API-CONTRACT.md):
// assigned library decks + published per-student PDFs for THIS teacher's
// students only — scoped server-side — with the same row shape as the admin
// /assignments endpoint:
//   { rows:[{ lesson_id, title, student_slug, date, pdf_url, source:"library"|"published" }] }
//
// PDFs are fetched WITH the teacher bearer header (a plain <a href> cannot
// carry Authorization), then handed to the browser as a blob object-URL —
// Preview opens a tab, Download saves the file. Until the endpoint is live:
// calm "backend not live yet" panel. Rows are never mocked (KICKOFF.md rule 4).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getTeacherMaterials, teacherConsoleFetchBlob } from './consoleApi.js'
import { BackendNotLive, SectionError, SectionLoading } from './TeacherPanels.jsx'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function prettyDate(dateStr) {
  const str = String(dateStr || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const [y, m, d] = str.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return `${DAY_NAMES[dow]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

function safeFilename(title, lessonId) {
  const base = String(title || lessonId || 'lesson')
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .slice(0, 80)
  return `${base || String(lessonId || 'lesson')}.pdf`
}

const SOURCE_STYLES = {
  library: 'border-sky-200 bg-sky-50 text-sky-700',
  published: 'border-slate-200 bg-slate-100 text-slate-600',
}

function SourceChip({ source }) {
  if (!source) return null
  const style = SOURCE_STYLES[String(source).toLowerCase()] || 'border-slate-200 bg-slate-50 text-slate-600'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {String(source)}
    </span>
  )
}

export default function TeacherMaterials() {
  const { me, studentBySlug } = useOutletContext()

  const students = useMemo(
    () => (Array.isArray(me?.students) ? [...me.students] : [])
      .sort((a, b) => String(a?.name || a?.slug || '').localeCompare(String(b?.name || b?.slug || ''))),
    [me],
  )

  const [studentSlug, setStudentSlug] = useState('') // '' = all my students
  const [state, setState] = useState({ loading: true, error: null, rows: null })
  const [pdfBusy, setPdfBusy] = useState(null)       // pdf_url currently being fetched
  const [pdfNotice, setPdfNotice] = useState(null)   // error text for a failed fetch

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await getTeacherMaterials({ studentSlug: studentSlug || undefined })
      setState({ loading: false, error: null, rows: Array.isArray(data?.rows) ? data.rows : [] })
    } catch (err) {
      setState({ loading: false, error: err, rows: null })
    }
  }, [studentSlug])
  useEffect(() => { load() }, [load])

  // Group rows by student (sorted by display name), newest material first.
  const grouped = useMemo(() => {
    const rows = state.rows || []
    const map = new Map()
    for (const r of rows) {
      const key = r?.student_slug || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))
    }
    return [...map.entries()].sort((a, b) => {
      const nameA = studentBySlug?.[a[0]]?.name || a[0]
      const nameB = studentBySlug?.[b[0]]?.name || b[0]
      return String(nameA).localeCompare(String(nameB))
    })
  }, [state.rows, studentBySlug])

  const openPdf = useCallback(async (row, download) => {
    if (!row?.pdf_url || pdfBusy) return
    setPdfBusy(row.pdf_url)
    setPdfNotice(null)
    try {
      // Contract: ?download=1 asks the backend for an attachment disposition.
      const url = download
        ? row.pdf_url + (String(row.pdf_url).includes('?') ? '&' : '?') + 'download=1'
        : row.pdf_url
      const blob = await teacherConsoleFetchBlob(url)
      const objectUrl = URL.createObjectURL(blob)
      if (download) {
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = safeFilename(row.title, row.lesson_id)
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        window.open(objectUrl, '_blank', 'noopener')
      }
      // Give the browser a minute to consume the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch (err) {
      setPdfNotice(`Could not fetch the PDF — ${String(err?.message || err)}`)
    } finally {
      setPdfBusy(null)
    }
  }, [pdfBusy])

  const materialRow = (row, i) => (
    <div
      key={`${row?.lesson_id || 'row'}-${row?.date || ''}-${i}`}
      className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_38px_-30px_rgba(2,132,199,0.55)]"
    >
      <span className="material-symbols-outlined text-2xl text-sky-500">picture_as_pdf</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{row?.title || row?.lesson_id || 'Untitled lesson'}</p>
        <p className="text-xs text-slate-400">{prettyDate(row?.date)}</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SourceChip source={row?.source} />
        {row?.pdf_url && (
          <>
            <button
              onClick={() => openPdf(row, false)}
              disabled={Boolean(pdfBusy)}
              title="Preview PDF"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 transition enabled:cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              {pdfBusy === row.pdf_url ? 'Fetching…' : 'Preview'}
            </button>
            <button
              onClick={() => openPdf(row, true)}
              disabled={Boolean(pdfBusy)}
              title="Download PDF"
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition enabled:cursor-pointer disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Download
            </button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Materials</p>
          <h2 className="mt-1 font-headline text-3xl text-slate-900">Lesson <span className="italic text-sky-600">Material</span></h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Every deck and PDF assigned to your students — library assignments and published lesson files,
            scoped to you on the server. Preview in a new tab or download for class.
          </p>
        </div>
        <button
          onClick={load}
          title="Refresh"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Refresh
        </button>
      </div>

      {/* student filter */}
      <label className="mt-4 flex max-w-sm flex-col gap-1">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Student</span>
        <select
          value={studentSlug}
          onChange={e => setStudentSlug(e.target.value)}
          className="rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none cursor-pointer"
        >
          <option value="">All my students</option>
          {students.map(s => (
            <option key={s?.slug} value={s?.slug}>{s?.name || s?.slug}</option>
          ))}
        </select>
        {students.length === 0 && (
          <span className="text-xs text-slate-400">Student names appear here once the roster endpoint is live.</span>
        )}
      </label>

      {pdfNotice && (
        <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50/80 px-5 py-3 text-sm font-semibold text-rose-800">
          {pdfNotice}
        </div>
      )}

      <div className="mt-4">
        {state.loading ? (
          <SectionLoading />
        ) : state.error?.kind === 'not-live' ? (
          <BackendNotLive endpoint="GET /api/console/teacher/materials" />
        ) : state.error ? (
          <SectionError error={state.error} onRetry={load} />
        ) : (state.rows || []).length === 0 ? (
          <p className="text-sm text-slate-500 py-2">
            No materials here yet — once lessons are assigned to {studentSlug ? 'this student' : 'your students'}, their decks and PDFs appear here.
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([slug, rows]) => (
              <div key={slug}>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {studentBySlug?.[slug]?.name || slug} · {rows.length} item{rows.length === 1 ? '' : 's'}
                </p>
                <div className="mt-2 space-y-2">
                  {rows.map(materialRow)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
