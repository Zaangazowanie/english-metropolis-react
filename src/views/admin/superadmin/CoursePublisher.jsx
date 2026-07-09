// CoursePublisher — the "Publish lesson material" wizard (2026-07-09, Mike's spec).
//
// Publishing is COURSE-FIRST and PDF-ONLY. The Hyperagent-built course library
// (em-course-library, served by em-console-api) is preloaded — there is no
// manual URL entry anywhere. Onion UX: four layers, each collapsing to a
// summary chip once answered, so the operator always sees where they are.
//
//   1 · Student   — active roster, CEFR shown
//   2 · Course    — recommended for the student's CEFR first, then everything
//   3 · Lessons   — numbered decks; add/remove, download PDF, preview keywords
//                   (each keyword shows its YouGlish cache state)
//   4 · Add       — review + sequential assign with live progress
//
// Publishing copies each deck's PDF into the student's webroot folder and
// appends a curriculum item (em-console-api /assign); the API also queues a
// YouGlish index build for any keyword not yet cached, so freshly published
// lessons are always watchable.

import { useEffect, useMemo, useState } from 'react'
import { consoleGet, consoleGetBlob, consolePost, libraryPdfPath } from './consoleApi.js'
import { mutateAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const BASKET_ICON = { IDEAS: 'psychology', PLACES: 'public', SOCIETY: 'newspaper', SPEC: 'work', SUM: 'sunny' }
const BASKET_LABEL = { IDEAS: 'Ideas & Ambition', PLACES: 'Places & Culture', SOCIETY: 'News & Society' }

function courseBlurb(c) {
  if (c.course_id.startsWith('SPEC-')) return `Specialist track · ${c.lesson_count} lessons`
  if (c.course_id.startsWith('SUM-')) return `Summer intensive · ${c.lesson_count} lessons`
  return `${BASKET_LABEL[c.basket] || c.basket} · ${c.lesson_count} lessons`
}

// One answered wizard layer, collapsed to a chip row. Click re-opens it.
function LayerChip({ step, label, value, onEdit }) {
  return (
    <button type="button" onClick={onEdit} className="flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition hover:scale-[1.005]"
      style={{ borderColor: 'rgba(52,211,153,0.28)', background: 'rgba(52,211,153,0.05)' }}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
        style={{ background: 'rgba(52,211,153,0.16)', color: '#34D399' }}>{step}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#8A83AE' }}>{label}</span>
      <span className="truncate text-sm font-semibold" style={{ color: '#F4F0FF' }}>{value}</span>
      <span className="material-symbols-outlined ml-auto" style={{ fontSize: 16, color: '#8A83AE' }}>edit</span>
    </button>
  )
}

function LayerHeading({ step, label, hint }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
        style={{ background: 'linear-gradient(135deg, #8B5CF6, #D946EF)', color: '#fff' }}>{step}</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#F4F0FF' }}>{label}</span>
      {hint && <span className="text-xs" style={{ color: '#8A83AE' }}>{hint}</span>}
    </div>
  )
}

// Lazy keyword preview for one lesson — words + PL + YouGlish cache state.
function KeywordPreview({ lessonId }) {
  const [state, setState] = useState({ loading: true, keywords: [], cached: 0, total: 0 })
  useEffect(() => {
    let alive = true
    consoleGet(`/api/console/library/${encodeURIComponent(lessonId)}/keywords`)
      .then(d => { if (alive) setState({ loading: false, ...d }) })
      .catch(() => { if (alive) setState({ loading: false, keywords: [], cached: 0, total: 0 }) })
    return () => { alive = false }
  }, [lessonId])
  if (state.loading) return <p className="px-1 py-2 text-xs" style={{ color: '#8A83AE' }}>Loading keywords…</p>
  if (!state.keywords.length) return <p className="px-1 py-2 text-xs" style={{ color: '#8A83AE' }}>No keyword table in this deck.</p>
  return (
    <div className="mt-2 space-y-1.5 rounded-xl border p-3" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(8,4,20,0.45)' }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#8A83AE' }}>
        {state.total} keywords · {state.cached}/{state.total} YouGlish-cached
      </p>
      {state.keywords.map(k => (
        <div key={k.word} className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="material-symbols-outlined" title={k.youglish_cached ? 'YouGlish clips cached' : 'YouGlish caching queued'}
            style={{ fontSize: 13, color: k.youglish_cached ? '#34D399' : '#FCD34D' }}>
            {k.youglish_cached ? 'check_circle' : 'hourglass_top'}
          </span>
          <span className="font-bold" style={{ color: '#F4F0FF' }}>{k.word}</span>
          {k.ipa && <span style={{ color: '#5E567C', fontFamily: 'monospace' }}>{k.ipa}</span>}
          <span style={{ color: '#8A83AE', fontStyle: 'italic' }}>{k.pl}</span>
        </div>
      ))}
    </div>
  )
}

export default function CoursePublisher({ students, selectedStudentId, setSelectedStudentId }) {
  const roster = useMemo(() => students.filter(s => s.status !== 'archived'), [students])
  const student = roster.find(s => s._id === selectedStudentId) || null

  const [layer, setLayer] = useState(student ? 2 : 1)      // current open layer 1..4
  const [courses, setCourses] = useState(null)             // /courses payload
  const [courseId, setCourseId] = useState('')
  const [picked, setPicked] = useState(() => new Set())    // lesson_ids queued to publish
  const [openKw, setOpenKw] = useState(null)               // lesson_id with keywords expanded
  const [openDetail, setOpenDetail] = useState(null)       // lesson_id with full detail expanded
  const [showAll, setShowAll] = useState(false)
  const [publishing, setPublishing] = useState(null)       // {done, total, log:[]}
  const [busyRow, setBusyRow] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(null)
  // Scheduling (real bookings — fires the confirmation email + Meet pipeline)
  const [schedMode, setSchedMode] = useState('weekly')     // 'weekly' | 'flexible'
  const [weekly, setWeekly] = useState({ start: '', time: '17:00', count: 4 })
  const [flexRows, setFlexRows] = useState([''])
  const [booking, setBooking] = useState(null)             // {done,total,log:[],finished}

  // Warsaw wall-clock → UTC ms (matches the platform's Europe/Warsaw slots).
  function warsawToUtcMs(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const [hh, mm] = timeStr.split(':').map(Number)
    // Find the UTC instant whose Warsaw wall-clock equals the requested time.
    const guess = Date.UTC(y, m - 1, d, hh, mm)
    for (const offsetH of [2, 1, 0, 3]) {   // CEST first, then CET
      const t = guess - offsetH * 3600000
      const w = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date(t)).reduce((a, p) => (a[p.type] = p.value, a), {})
      if (Number(w.year) === y && Number(w.month) === m && Number(w.day) === d &&
          Number(w.hour) === hh && Number(w.minute) === mm) return t
    }
    return guess - 2 * 3600000
  }

  async function bookSchedule() {
    if (!student) return
    let starts = []
    if (schedMode === 'weekly') {
      if (!weekly.start || !weekly.time || !weekly.count) return
      for (let i = 0; i < Math.min(Number(weekly.count) || 1, 24); i++) {
        const d = new Date(`${weekly.start}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() + 7 * i)
        starts.push(warsawToUtcMs(d.toISOString().slice(0, 10), weekly.time))
      }
    } else {
      starts = flexRows.filter(Boolean).map(v => {
        const [date, time] = v.split('T')
        return warsawToUtcMs(date, (time || '17:00').slice(0, 5))
      })
    }
    if (!starts.length) return
    setBooking({ done: 0, total: starts.length, log: [], finished: false })
    const fmt = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw',
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
    for (const startUtc of starts) {
      try {
        const res = await mutateAdminConvex('scheduling:bookLesson', {
          organizationId: student.organizationId,
          studentId: student._id,
          startUtc,
          bookedBy: 'superadmin',
          bookedByName: 'Superadmin console',
          force: true,
        })
        setBooking(b => ({ ...b, done: b.done + 1,
          log: [...b.log, { ok: true, when: fmt(startUtc), meet: res?.meetLink }] }))
      } catch (e) {
        setBooking(b => ({ ...b, done: b.done + 1,
          log: [...b.log, { ok: false, when: fmt(startUtc), err: String(e.message || e).replace(/^.*Error: /, '') }] }))
      }
    }
    setBooking(b => ({ ...b, finished: true }))
  }

  // Authenticated PDF preview — a bare <a href> carries no console token, so
  // fetch the deck as a blob and hand it to the browser's PDF viewer.
  async function previewPdf(lessonId) {
    setPdfBusy(lessonId)
    try {
      const blob = await consoleGetBlob(libraryPdfPath(lessonId))
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      // anchor-click (not window.open+noopener) — Chromium drops blob
      // navigations when the opener is severed before the load starts
      const a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) {
      alert(`Could not load the PDF: ${e.message || e}`)
    } finally { setPdfBusy(null) }
  }

  // (Re)load the preloaded course list whenever the student changes — the
  // per-lesson "assigned" overlay is student-specific.
  useEffect(() => {
    if (!student?.slug) return
    let alive = true
    setCourses(null)
    consoleGet('/api/console/courses', { student_slug: student.slug })
      .then(d => { if (alive) setCourses(d.courses || []) })
      .catch(() => { if (alive) setCourses([]) })
    return () => { alive = false }
  }, [student?.slug, publishing?.finished])

  const course = (courses || []).find(c => c.course_id === courseId) || null
  const recommended = (courses || []).filter(c => c.level && student?.level &&
    c.level.toUpperCase() === String(student.level).toUpperCase())
  const others = (courses || []).filter(c => !recommended.includes(c))

  const pickStudent = (id) => { setSelectedStudentId(id); setCourseId(''); setPicked(new Set()); setLayer(2) }
  const pickCourse = (id) => { setCourseId(id); setPicked(new Set()); setLayer(3) }
  const togglePick = (id) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function publishPicked() {
    if (!student || !picked.size) return
    const ids = [...picked]
    setLayer(4)
    setPublishing({ done: 0, total: ids.length, log: [] })
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    for (let i = 0; i < ids.length; i++) {
      const lid = ids[i]
      // nginx rate-limits /api/console/ — pace bulk adds and retry 503s with
      // backoff instead of failing half the course (2026-07-09 incident).
      let res = null, err = null
      for (let attempt = 0; attempt < 4; attempt++) {
        try { res = await consolePost('/api/console/assign', { lesson_id: lid, student_slug: student.slug }); err = null; break }
        catch (e) {
          err = e
          if (e.status === 503 || e.status === 429) { await sleep(2500 * (attempt + 1)); continue }
          break
        }
      }
      if (res) {
        setPublishing(p => ({ ...p, done: p.done + 1,
          log: [...p.log, { lid, ok: true, warn: res.warning || null, yg: res.youglish_queued || 0 }] }))
      } else {
        setPublishing(p => ({ ...p, done: p.done + 1,
          log: [...p.log, { lid, ok: false, warn: String(err?.message || err) }] }))
      }
      if (i < ids.length - 1) await sleep(2200)   // stay under the console rate limit
    }
    setPicked(new Set())
    setPublishing(p => ({ ...p, finished: true }))
  }

  async function unassign(lid) {
    if (!student) return
    setBusyRow(lid)
    try {
      await consolePost('/api/console/unassign', { lesson_id: lid, student_slug: student.slug })
      const d = await consoleGet('/api/console/courses', { student_slug: student.slug })
      setCourses(d.courses || [])
    } finally { setBusyRow(null) }
  }

  return (
    <div className="space-y-3">
      {/* ── Layer 1 · Student ── */}
      {layer > 1 && student ? (
        <LayerChip step="1" label="Student" value={`${student.name} · ${student.level || '?'}`} onEdit={() => setLayer(1)} />
      ) : (
        <div className="space-y-2">
          <LayerHeading step="1" label="Who is this for?" />
          <div className="grid gap-2 sm:grid-cols-2">
            {roster.map(s => (
              <button key={s._id} type="button" onClick={() => pickStudent(s._id)}
                className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:scale-[1.01]"
                style={{ borderColor: s._id === selectedStudentId ? 'rgba(217,70,239,0.45)' : 'rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)' }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6, #D946EF)', color: '#fff' }}>
                  {(s.name || '?').slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold" style={{ color: '#F4F0FF' }}>{s.name}</span>
                  <span className="text-xs" style={{ color: '#8A83AE' }}>CEFR {s.level || 'unknown'}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Layer 2 · Course ── */}
      {layer === 2 && student && (
        <div className="space-y-3">
          <LayerHeading step="2" label="Set the course" hint="from the preloaded Hyperagent library" />
          {courses === null ? (
            <p className="text-sm" style={{ color: '#8A83AE' }}>Loading the course library…</p>
          ) : (
            <>
              {recommended.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#34D399' }}>
                    Recommended for {student.level}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {recommended.map(c => <CourseCard key={c.course_id} c={c} onPick={pickCourse} highlight />)}
                  </div>
                </>
              )}
              <button type="button" onClick={() => setShowAll(v => !v)}
                className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: '#8A83AE', background: 'none', border: 'none', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, transform: showAll ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>expand_more</span>
                All courses ({others.length})
              </button>
              {showAll && (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {others.map(c => <CourseCard key={c.course_id} c={c} onPick={pickCourse} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {layer > 2 && course && (
        <LayerChip step="2" label="Course" value={`${course.course_id} · ${course.level} · ${course.lesson_count} lessons`} onEdit={() => setLayer(2)} />
      )}

      {/* ── Layer 3 · Lessons ── */}
      {layer === 3 && course && student && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LayerHeading step="3" label="Choose the lessons" hint="PDF decks only — numbered as taught" />
            <div className="flex gap-2">
              <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.35rem 0.8rem' }}
                onClick={() => setPicked(new Set(course.lessons.filter(l => !l.assigned).map(l => l.lesson_id)))}>
                Select all
              </button>
              <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.35rem 0.8rem' }}
                onClick={() => setPicked(new Set())}>Clear</button>
            </div>
          </div>
          <div className="space-y-1.5" style={{ maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
            {course.lessons.map(l => (
              <div key={l.lesson_id} className="rounded-xl border px-3 py-2"
                style={{ borderColor: picked.has(l.lesson_id) ? 'rgba(217,70,239,0.4)' : 'rgba(255,255,255,0.07)',
                  background: l.assigned ? 'rgba(52,211,153,0.05)' : 'rgba(255,255,255,0.025)' }}>
                <div className="flex items-center gap-3">
                  {l.assigned ? (
                    <span className="sa-badge sa-badge-committed" style={{ flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>in course
                    </span>
                  ) : (
                    <input type="checkbox" checked={picked.has(l.lesson_id)} onChange={() => togglePick(l.lesson_id)}
                      style={{ width: 16, height: 16, accentColor: '#D946EF', flexShrink: 0, cursor: 'pointer' }} />
                  )}
                  <span className="font-mono text-xs font-bold" style={{ color: '#8A83AE', width: 26, flexShrink: 0 }}>
                    {String(l.lesson_number ?? '?').padStart(2, '0')}
                  </span>
                  <button type="button"
                    onClick={() => { setOpenDetail(openDetail === l.lesson_id ? null : l.lesson_id); setOpenKw(null) }}
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                    style={{ color: '#F4F0FF', background: 'none', border: 'none', cursor: 'pointer' }}
                    title="Open lesson details">
                    {l.title}
                  </button>
                  <button type="button" title="Preview keywords"
                    onClick={() => setOpenKw(openKw === l.lesson_id ? null : l.lesson_id)}
                    className="sa-badge sa-badge-processing" style={{ cursor: 'pointer', border: 'none', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>translate</span>
                    {l.keyword_count} kw
                  </button>
                  <button type="button" onClick={() => previewPdf(l.lesson_id)} title="Preview the lesson PDF"
                    className="sa-badge sa-badge-queued" style={{ cursor: 'pointer', border: 'none', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                      {pdfBusy === l.lesson_id ? 'hourglass_top' : 'picture_as_pdf'}
                    </span>PDF
                  </button>
                  {l.assigned && (
                    <button type="button" onClick={() => unassign(l.lesson_id)} disabled={busyRow === l.lesson_id}
                      title="Remove from the course" className="sa-btn sa-btn-ghost"
                      style={{ padding: '0.25rem 0.5rem', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        {busyRow === l.lesson_id ? 'hourglass_top' : 'delete'}
                      </span>
                    </button>
                  )}
                </div>
                {openKw === l.lesson_id && openDetail !== l.lesson_id && <KeywordPreview lessonId={l.lesson_id} />}
                {openDetail === l.lesson_id && (
                  <div className="mt-2 space-y-2 rounded-xl border p-3"
                    style={{ borderColor: 'rgba(217,70,239,0.22)', background: 'rgba(8,4,20,0.45)' }}>
                    {l.topic && (
                      <p className="text-xs" style={{ color: '#8A83AE', lineHeight: 1.6 }}>
                        {String(l.topic).slice(0, 300)}{String(l.topic).length > 300 ? '…' : ''}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => previewPdf(l.lesson_id)} className="sa-btn sa-btn-ghost" style={{ padding: '0.35rem 0.8rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                          {pdfBusy === l.lesson_id ? 'hourglass_top' : 'picture_as_pdf'}
                        </span>
                        Preview PDF
                      </button>
                      {l.video_url && (
                        <a href={l.video_url} target="_blank" rel="noopener" className="sa-btn sa-btn-ghost"
                          style={{ padding: '0.35rem 0.8rem', textDecoration: 'none' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>smart_display</span>
                          Lesson video
                        </a>
                      )}
                    </div>
                    <KeywordPreview lessonId={l.lesson_id} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs" style={{ color: '#8A83AE' }}>
              {course.assigned_count} in course · {picked.size} selected
            </span>
            <button type="button" className="sa-btn sa-btn-primary" disabled={!picked.size} onClick={publishPicked}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>playlist_add</span>
              Add {picked.size || ''} lesson{picked.size === 1 ? '' : 's'} to course
            </button>
          </div>
        </div>
      )}

      {/* ── Layer 4 · Publish progress ── */}
      {layer === 4 && publishing && (
        <div className="space-y-2">
          <LayerHeading step="4" label={publishing.finished ? 'Course updated' : 'Adding to course…'}
            hint={`${publishing.done}/${publishing.total}`} />
          <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(publishing.done / publishing.total) * 100}%`,
              background: 'linear-gradient(90deg, #8B5CF6, #D946EF)', transition: 'width 300ms ease' }} />
          </div>
          <div className="space-y-1">
            {publishing.log.map(r => (
              <div key={r.lid} className="flex items-center gap-2 text-xs">
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: r.ok ? '#34D399' : '#FB7185' }}>
                  {r.ok ? 'check_circle' : 'error'}
                </span>
                <span className="font-mono" style={{ color: '#F4F0FF' }}>{r.lid}</span>
                {r.ok && r.yg > 0 && <span style={{ color: '#FCD34D' }}>· {r.yg} keyword{r.yg === 1 ? '' : 's'} queued for YouGlish</span>}
                {r.warn && <span style={{ color: '#FCD34D' }}>· {r.warn}</span>}
              </div>
            ))}
          </div>
          {publishing.finished && (
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setPublishing(null); setLayer(3) }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              Back to the course
            </button>
          )}
        </div>
      )}

      {/* ── Schedule — real bookings (confirmation emails + Meet fire automatically) ── */}
      {student && layer >= 3 && (
        <div className="mt-2 space-y-3 rounded-2xl border p-4"
          style={{ borderColor: 'rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.04)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                style={{ background: 'linear-gradient(135deg, #60A5FA, #3B82F6)', color: '#fff' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_add_on</span>
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#F4F0FF' }}>
                Schedule lessons for {student.name.split(' ')[0]}
              </span>
            </div>
            <div className="flex gap-1 rounded-full border p-0.5" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              {['weekly', 'flexible'].map(m => (
                <button key={m} type="button" onClick={() => setSchedMode(m)}
                  className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ cursor: 'pointer', border: 'none',
                    background: schedMode === m ? 'linear-gradient(135deg, #60A5FA, #3B82F6)' : 'transparent',
                    color: schedMode === m ? '#fff' : '#8A83AE' }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs" style={{ color: '#8A83AE', lineHeight: 1.55 }}>
            Superadmin bookings <strong style={{ color: '#CEC8E8' }}>override teacher availability</strong> —
            only a clash with an already-booked lesson can refuse a time. Every confirmed lesson automatically
            emails the teacher, English Metro support and the student (with an add-to-calendar button), and
            books the video room. Times are Europe/Warsaw; lessons are 60 minutes.
          </p>

          {schedMode === 'weekly' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="sa-stat-label">First lesson</span>
                <input type="date" className="sa-input" value={weekly.start}
                  onChange={e => setWeekly(w => ({ ...w, start: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="sa-stat-label">Time</span>
                <input type="time" className="sa-input" value={weekly.time}
                  onChange={e => setWeekly(w => ({ ...w, time: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="sa-stat-label">Weeks</span>
                <input type="number" min="1" max="24" className="sa-input" style={{ width: '5.5rem' }} value={weekly.count}
                  onChange={e => setWeekly(w => ({ ...w, count: e.target.value }))} />
              </label>
              <span className="pb-2 text-xs" style={{ color: '#8A83AE' }}>
                same weekday &amp; time, every week
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {flexRows.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="datetime-local" className="sa-input" style={{ maxWidth: '16rem' }} value={v}
                    onChange={e => setFlexRows(rows => rows.map((r, idx) => idx === i ? e.target.value : r))} />
                  <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.3rem 0.6rem' }}
                    onClick={() => setFlexRows(rows => rows.length === 1 ? [''] : rows.filter((_, idx) => idx !== i))}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                  </button>
                </div>
              ))}
              <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.35rem 0.8rem' }}
                onClick={() => setFlexRows(rows => [...rows, ''])}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
                Another time
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs" style={{ color: '#8A83AE' }}>
              {schedMode === 'weekly'
                ? (weekly.start ? `${weekly.count || 1} weekly lesson${(weekly.count || 1) == 1 ? '' : 's'} from ${weekly.start} at ${weekly.time}` : 'pick the first lesson date')
                : `${flexRows.filter(Boolean).length} time${flexRows.filter(Boolean).length === 1 ? '' : 's'} chosen`}
            </span>
            <button type="button" className="sa-btn sa-btn-primary" onClick={bookSchedule}
              disabled={(booking && !booking.finished) || (schedMode === 'weekly' ? !weekly.start : !flexRows.some(Boolean))}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>event_available</span>
              {booking && !booking.finished ? `Booking ${booking.done}/${booking.total}…` : 'Confirm & book'}
            </button>
          </div>

          {booking && (
            <div className="space-y-1">
              {booking.log.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: r.ok ? '#34D399' : '#FB7185' }}>
                    {r.ok ? 'event_available' : 'error'}
                  </span>
                  <span style={{ color: '#F4F0FF', fontWeight: 600 }}>{r.when}</span>
                  {r.ok
                    ? <span style={{ color: '#34D399' }}>booked · confirmations sent</span>
                    : <span style={{ color: '#FB7185' }}>{r.err}</span>}
                </div>
              ))}
              {booking.finished && (
                <p className="text-[11px]" style={{ color: '#8A83AE' }}>
                  Emails go to the teacher, support@englishmetro.com and the student's own address.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CourseCard({ c, onPick, highlight = false }) {
  const done = c.lesson_count > 0 ? c.assigned_count / c.lesson_count : 0
  return (
    <button type="button" onClick={() => onPick(c.course_id)}
      className="rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5"
      style={{ borderColor: highlight ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }}>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: highlight ? '#34D399' : '#A855F7' }}>
          {BASKET_ICON[c.basket] || 'menu_book'}
        </span>
        <span className="font-mono text-xs font-bold" style={{ color: '#F4F0FF' }}>{c.course_id}</span>
        <span className="sa-badge sa-badge-processing ml-auto">{c.level || '—'}</span>
      </div>
      <p className="mt-2 text-xs" style={{ color: '#8A83AE' }}>{courseBlurb(c)}</p>
      <div className="mt-2.5" style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${done * 100}%`, background: 'linear-gradient(90deg, #34D399, #10B981)' }} />
      </div>
      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: c.assigned_count ? '#34D399' : '#5E567C' }}>
        {c.assigned_count}/{c.lesson_count} in course
      </p>
    </button>
  )
}
