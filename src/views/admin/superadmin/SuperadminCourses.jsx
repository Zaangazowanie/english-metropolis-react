// SuperadminCourses — the STUDENTS workspace (renamed from "Courses",
// 2026-07-09). Pick a student → their course loads with everything editable:
// course material, scheduling, and taught lessons. Keyword editing appears
// ONLY inside a specific opened lesson — never as a standing panel.

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import CoursePublisher from './CoursePublisher.jsx'
import { ConsoleEmpty, ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'
import { consoleGet } from './consoleApi.js'

const emptyKeyword = {
  word: '', translation: '', definitionEn: '', definitionPl: '',
  exampleEn: '', examplePl: '', ipa: '', stressUK: '', stressUS: '', topics: '',
}

export default function SuperadminCourses() {
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [taught, setTaught] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stuVersion, setStuVersion] = useState(0)
  const [packages, setPackages] = useState(null)
  const [allocStep, setAllocStep] = useState(null)   // null | 'input' | 'confirm'
  const [orders, setOrders] = useState([])
  const [orderBusy, setOrderBusy] = useState(null)
  const [allocN, setAllocN] = useState(10)
  const [allocVersion, setAllocVersion] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const wantSlug = searchParams.get('student') || ''

  // Deep link: /academic/students?student=<slug> opens that course directly
  // (Readiness, Today and the course cards link here).
  useEffect(() => {
    if (!wantSlug || !students.length) return
    const hit = students.find(s => s.slug === wantSlug)
    if (hit && hit._id !== studentId) setStudentId(hit._id)
  }, [wantSlug, students])
  const pickStudent = (id) => {
    setStudentId(id)
    const hit = students.find(s => s._id === id)
    setSearchParams(hit ? { student: hit.slug } : {}, { replace: true })
  }

  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listStudents', {})
      .then(rows => {
        if (!alive) return
        const roster = (rows || []).filter(s => s.status !== 'archived')
        setStudents(roster)
      })
      .catch(e => { if (alive) setError(e.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [stuVersion])

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    queryAdminConvex('students:listLessons', { studentId, limit: 80 })
      .then(rows => { if (!cancelled) setTaught(rows || []) })
      .catch(() => { if (!cancelled) setTaught([]) })
    return () => { cancelled = true }
  }, [studentId])

  const student = students.find(s => s._id === studentId) || null

  useEffect(() => {
    if (!student?.organizationId) { setPackages(null); return }
    let cancelled = false
    queryAdminConvex('billing:listPackages', { organizationId: student.organizationId })
      .then(rows => { if (!cancelled) setPackages((rows || []).filter(p => p.studentSlug === student.slug && p.status !== 'cancelled')) })
      .catch(() => { if (!cancelled) setPackages([]) })
    return () => { cancelled = true }
  }, [student?._id, allocVersion])

  useEffect(() => {
    if (!student?._id) { setOrders([]); return }
    let cancelled = false
    queryAdminConvex('orders:listOrders', {})
      .then(rows => { if (!cancelled) setOrders((rows || []).filter(o => String(o.studentId) === String(student._id))) })
      .catch(() => { if (!cancelled) setOrders([]) })
    return () => { cancelled = true }
  }, [student?._id, allocVersion])

  async function actOnOrder(orderId, action) {
    setOrderBusy(orderId)
    try {
      await mutateAdminConvex(`orders:${action}`, { orderId })
      setAllocVersion(v => v + 1)
    } finally { setOrderBusy(null) }
  }

  const allocated = (packages || []).reduce((n, p) => n + (p.totalLessons || 0), 0)
  const remaining = (packages || []).reduce((n, p) => n + (p.remainingLessons ?? 0), 0)

  async function allocate() {
    const n = Math.max(1, Math.min(Number(allocN) || 0, 200))
    await mutateAdminConvex('billing:createPackage', {
      organizationId: student.organizationId, studentId: student._id,
      name: `${n}-lesson allocation (superadmin)`, totalLessons: n,
    })
    setAllocStep(null)
    setAllocVersion(v => v + 1)
  }

  if (loading) return <ConsoleSkeleton />

  return (
    <div className="space-y-5">
      {error && (
        <div className="sa-card" style={{ padding: '0.8rem 1.1rem', borderColor: 'var(--sa-bad)', background: 'var(--sa-bad-soft)' }}>
          <span style={{ color: 'var(--sa-bad)', fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}

      <div className="sa-page-header">
        <div>
          <h1>Courses</h1>
          <p>Every active student's course at a glance: lessons left, next lesson, the material they are working through and what has been published. Open one to edit it.</p>
        </div>
        <div className="sa-page-header-actions">
          {student && (
            <button type="button" className="sa-btn sa-btn-ghost" onClick={() => pickStudent('')}>
              <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>All courses
            </button>
          )}
          <StudentSelect students={students} value={studentId} onPick={pickStudent} />
        </div>
      </div>

      {!student && (
        <CourseOverview students={students} version={stuVersion + allocVersion} onOpen={pickStudent} />
      )}

      {student && (
        <>
          {/* ── Student header strip ── */}
          <div className="sa-card" style={{ padding: '0.9rem 1.2rem', display: 'flex', flexWrap: 'wrap',
            alignItems: 'center', gap: '1.25rem' }}>
            <div>
              <p className="sa-stat-label">Student</p>
              <p className="sa-stat-value" style={{ fontSize: '1.2rem' }}>{student.name}</p>
            </div>
            <div><p className="sa-stat-label">CEFR</p><p className="sa-stat-value" style={{ fontSize: '1.2rem' }}>{student.level || '—'}</p></div>
            <div><p className="sa-stat-label">Taught lessons</p><p className="sa-stat-value" style={{ fontSize: '1.2rem' }}>{taught.length}</p></div>
            <div>
              <p className="sa-stat-label">Lesson allocation</p>
              <p className="sa-stat-value" style={{ fontSize: '0.95rem',
                color: remaining > 0 ? 'var(--sa-good)' : 'var(--sa-bad)' }}>
                {packages === null ? '…' : `${remaining} of ${allocated} remaining`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {allocStep === null && (
                <button type="button" className="sa-btn sa-btn-primary" style={{ padding: '0.45rem 1rem' }}
                  onClick={() => setAllocStep('input')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>token</span>
                  Allocate lessons
                </button>
              )}
              {allocStep === 'input' && (
                <>
                  <input type="number" min="1" max="200" autoFocus className="sa-input"
                    style={{ width: '5rem', padding: '0.4rem 0.6rem' }}
                    value={allocN} onChange={e => setAllocN(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && Number(allocN) > 0) setAllocStep('confirm') }} />
                  <button type="button" className="sa-btn sa-btn-primary" style={{ padding: '0.4rem 0.9rem' }}
                    disabled={!Number(allocN)} onClick={() => setAllocStep('confirm')}>
                    Next
                  </button>
                  <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.7rem' }}
                    onClick={() => setAllocStep(null)}>
                    Cancel
                  </button>
                </>
              )}
              {allocStep === 'confirm' && (
                <>
                  <span className="text-xs font-semibold" style={{ color: 'var(--sa-warm-ink)' }}>
                    Allocate {Number(allocN)} lesson{Number(allocN) === 1 ? '' : 's'} to {student.name.split(' ')[0]}?
                  </span>
                  <button type="button" className="sa-btn sa-btn-primary" style={{ padding: '0.4rem 0.9rem' }} onClick={allocate}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                    Confirm
                  </button>
                  <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.7rem' }}
                    onClick={() => setAllocStep(null)}>
                    Cancel
                  </button>
                </>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Link to={`/admin/superadmin/academic/roster/${student.slug}/heatmap`} className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.9rem', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>local_fire_department</span>
                Heatmap
              </Link>
              <a href={`/app/${student.slug}`} target="_blank" rel="noopener" className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.9rem', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                Student panel
              </a>
            </div>
          </div>

          {/* ── Lesson orders — student-submitted purchases awaiting manual invoice ── */}
          {orders.length > 0 && (
            <div className="sa-card">
              <div className="sa-card-header">
                <h2>Lesson orders · {orders.length}</h2>
                {orders.some(o => o.status === 'pending_invoice') && (
                  <span className="sa-badge sa-badge-awaiting_review">
                    {orders.filter(o => o.status === 'pending_invoice').length} awaiting payment confirmation
                  </span>
                )}
              </div>
              <div className="sa-card-body space-y-2">
                {orders.map(o => (
                  <div key={o._id} className="rounded-xl border px-3 py-2.5"
                    style={{ borderColor: o.status === 'pending_invoice' ? 'var(--sa-warm-ink)' : 'var(--sa-border)',
                      background: o.status === 'pending_invoice' ? 'var(--sa-warm-soft)' : 'var(--sa-surface)' }}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-bold" style={{ color: 'var(--sa-text)' }}>{o.packageName}</span>
                      <span className="text-xs" style={{ color: 'var(--sa-text-muted)' }}>{o.lessons} lessons · {o.priceLabel}</span>
                      <span className={`sa-badge ${o.status === 'confirmed' ? 'sa-badge-committed' : o.status === 'cancelled' ? 'sa-badge-queued' : 'sa-badge-awaiting_review'}`}>
                        {o.status === 'pending_invoice' ? 'awaiting invoice / payment' : o.status}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--sa-text-muted)' }}>
                        {new Date(o.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {o.status === 'pending_invoice' && (
                        <span className="ml-auto flex gap-2">
                          <button type="button" className="sa-btn sa-btn-primary" style={{ padding: '0.3rem 0.8rem' }}
                            disabled={orderBusy === o._id}
                            onClick={() => actOnOrder(o._id, 'confirmOrder')}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>price_check</span>
                            {orderBusy === o._id ? '…' : `Confirm paid → +${o.lessons}`}
                          </button>
                          <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.3rem 0.7rem' }}
                            disabled={orderBusy === o._id}
                            onClick={() => actOnOrder(o._id, 'cancelOrder')}>
                            Cancel
                          </button>
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-xs" style={{ color: 'var(--sa-text-muted)' }}>
                      {['fullName', 'email', 'phone', 'company', 'nip', 'addressLine', 'postalCode', 'city', 'country']
                        .map(k => o.billing?.[k]).filter(Boolean).join(' · ')}
                      {o.billing?.notes ? ` · “${o.billing.notes}”` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── His course: material + scheduling (auto-opens the active course) ── */}
          <div className="sa-card">
            <div className="sa-card-header">
              <h2>{student.name.split(' ')[0]}&rsquo;s course</h2>
              <span className="sa-badge sa-badge-committed" title="Only library PDF decks can be set as course material — no manual links">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>picture_as_pdf</span>
                PDF library only
              </span>
            </div>
            <div className="sa-card-body">
              <CoursePublisher students={students} selectedStudentId={studentId}
                setSelectedStudentId={setStudentId} fixedStudent={student} allocVersion={allocVersion}
                onBookingsChanged={() => setAllocVersion(v => v + 1)}
                onStudentChanged={() => setStuVersion(v => v + 1)} />
            </div>
          </div>

          {/* ── Taught lessons — keyword bank appears ONLY inside an opened lesson ── */}
          <div className="sa-card">
            <div className="sa-card-header">
              <h2>Taught lessons · {taught.length}</h2>
              <span className="text-xs" style={{ color: 'var(--sa-text-muted)' }}>open a lesson to edit its keyword bank</span>
            </div>
            <div className="sa-card-body space-y-1.5">
              {taught.length === 0 ? (
                <ConsoleEmpty icon="menu_book" title="No taught lessons yet." />
              ) : (
                taught.map(l => <TaughtLessonRow key={l._id} lesson={l} student={student} />)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── All courses at a glance ─────────────────────────────────────────────────
// Three reads, settled independently so one dead seam cannot blank the grid:
// booking-readiness (balance, next lesson, blockers — the booking gate's own
// function), assignments (course material + published lessons per student),
// and the course library (so "19 of 24" can be said per course).
const courseOf = lessonId => String(lessonId || '').replace(/-\d+$/, '')

function initialsOf(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function CourseOverview({ students, version, onOpen }) {
  const [ready, setReady] = useState(null)
  const [assign, setAssign] = useState(null)
  const [library, setLibrary] = useState(null)
  const [failed, setFailed] = useState([])
  const [q, setQ] = useState('')
  const [view, setView] = useState('all')

  useEffect(() => {
    let alive = true
    Promise.allSettled([
      consoleGet('/api/console/booking-readiness'),
      consoleGet('/api/console/assignments'),
      consoleGet('/api/console/courses'),
    ]).then(([r, a, c]) => {
      if (!alive) return
      const bad = []
      if (r.status === 'fulfilled' && r.value?.ok !== false) setReady(r.value); else { setReady({}); bad.push('balances') }
      if (a.status === 'fulfilled') setAssign(a.value?.rows || []); else { setAssign([]); bad.push('course material') }
      if (c.status === 'fulfilled') setLibrary(c.value?.courses || []); else { setLibrary([]); bad.push('library') }
      setFailed(bad)
    })
    return () => { alive = false }
  }, [version])

  const cards = useMemo(() => {
    if (!ready || !assign || !library) return null
    const bySlug = new Map((ready.students || []).map(r => [r.slug, r]))
    const size = new Map(library.map(c => [c.course_id, c.lesson_count]))
    return students.map(s => {
      const r = bySlug.get(s.slug) || null
      const mine = assign.filter(a => a.student_slug === s.slug)
      const lib = mine.filter(a => a.source === 'library' && a.lesson_id)
      const published = mine.filter(a => a.source === 'published')
      const counts = new Map()
      for (const a of lib) { const k = courseOf(a.lesson_id); counts.set(k, (counts.get(k) || 0) + 1) }
      const material = [...counts.entries()].map(([id, n]) => ({ id, n, of: size.get(id) || null }))
        .sort((x, y) => y.n - x.n)
      return { s, r, material, published: published.length, libCount: lib.length }
    }).sort((x, y) => {
      const px = x.r?.paidButNeverBooked ? 0 : 1, py = y.r?.paidButNeverBooked ? 0 : 1
      if (px !== py) return px - py
      const mx = x.material.length ? 0 : 1, my = y.material.length ? 0 : 1
      if (mx !== my) return mx - my
      return (x.s.name || '').localeCompare(y.s.name || '')
    })
  }, [students, ready, assign, library])

  if (!cards) return <div className="sa-card"><div className="sa-card-body"><ConsoleSkeleton rows={6} label="Reading every course" /></div></div>

  const needle = q.trim().toLowerCase()
  const shown = cards.filter(({ s, r, material }) => {
    if (needle && !`${s.name} ${s.slug} ${s.level || ''}`.toLowerCase().includes(needle)) return false
    if (view === 'paid') return !!r?.paidButNeverBooked
    if (view === 'can') return !!r?.canBook
    if (view === 'blocked') return r ? !r.canBook : false
    if (view === 'nomaterial') return material.length === 0
    return true
  })
  const n = key => cards.filter(({ r, material }) => key === 'paid' ? r?.paidButNeverBooked : key === 'can' ? r?.canBook : key === 'blocked' ? (r && !r.canBook) : material.length === 0).length
  const chip = (key, label) => (
    <button type="button" key={key} className={`sa-chip ${view === key ? 'is-active' : ''}`} onClick={() => setView(key)}>
      {label} · {key === 'all' ? cards.length : n(key)}
    </button>
  )

  return (
    <>
      {failed.length > 0 && (
        <div className="ops-alert is-warn">
          Could not read {failed.join(' and ')} right now. The cards below show what could be read; nothing here is a zero by default.
        </div>
      )}
      <div className="sa4-toolbar">
        <input type="search" className="sa-input" placeholder="Search name, slug or level…" value={q} onChange={e => setQ(e.target.value)} />
        {chip('all', 'All')}{chip('paid', 'Paid, never booked')}{chip('can', 'Can book')}{chip('blocked', 'Blocked')}{chip('nomaterial', 'No material yet')}
      </div>
      {shown.length === 0 ? (
        <ConsoleEmpty icon="school" title="No courses match" hint="Change the filter or clear the search." />
      ) : (
        <div className="sa4-cards">
          {shown.map(({ s, r, material, published }) => (
            <article key={s._id} className={`sa4-card ${r?.paidButNeverBooked ? 'is-bad' : ''}`}>
              <div className="sa4-card-head">
                <div className="sa3-avatar" aria-hidden="true">{initialsOf(s.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <h3>{s.name}</h3>
                  <div className="sa3-sub">
                    {s.level ? <LevelBadge level={s.level} /> : <span className="sa-badge">no level yet</span>}
                    {s.targetLevel && <span className="sa-badge">aiming for {s.targetLevel}</span>}
                    {r?.paidButNeverBooked ? <span className="ops-status is-bad">paid, never booked</span>
                      : r?.canBook ? <span className="ops-status is-good">can book</span>
                      : r ? (r.blockers || []).map(b => <span className="ops-status is-neutral" key={b}>{BLOCKER_LABEL[b] || b}</span>)
                      : <span className="ops-status is-neutral">balance unknown</span>}
                  </div>
                </div>
              </div>
              <div className="sa4-facts">
                <div className="sa4-fact">
                  <span>Lessons left</span>
                  <strong className={r && r.remaining === 0 ? 'is-bad' : ''}>
                    {r ? (r.remaining ?? '—') : '—'}
                    {r?.allocated ? <small> of {r.allocated}{r.used ? ` · ${r.used} used` : ''}</small> : null}
                  </strong>
                </div>
                <div className="sa4-fact">
                  <span>Next lesson</span>
                  <strong className={r?.nextLesson ? 'is-good' : ''}>{r?.nextLesson || 'none booked'}</strong>
                </div>
                <div className="sa4-fact">
                  <span>Published lessons</span>
                  <strong>{published}<small> on the student's page</small></strong>
                </div>
                <div className="sa4-fact">
                  <span>Email</span>
                  <strong className={r ? (r.emailVerified ? 'is-good' : 'is-bad') : ''}>{r ? (r.emailVerified ? 'confirmed' : 'unconfirmed') : '—'}</strong>
                </div>
              </div>
              <div className="sa4-material">
                <span>Course material</span>
                {material.length === 0 ? (
                  <div className="sa4-material-row"><small>No library course assigned yet.</small></div>
                ) : material.map(m => (
                  <div className="sa4-material-row" key={m.id}>
                    <code>{m.id}</code>
                    <div className="sa4-bar"><i style={{ width: m.of ? `${Math.min(100, Math.round(100 * m.n / m.of))}%` : '100%' }} /></div>
                    <small>{m.n}{m.of ? ` of ${m.of}` : ''} lessons</small>
                  </div>
                ))}
              </div>
              <div className="sa3-actions">
                <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => onOpen(s._id)}>
                  <span className="material-symbols-outlined" aria-hidden="true">school</span>Open course
                </button>
                <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`/admin/superadmin/school/preview?student=${encodeURIComponent(s.slug)}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">visibility</span>Student view
                </Link>
                <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`/admin/superadmin/academic/roster/${s.slug}/heatmap`}>
                  <span className="material-symbols-outlined" aria-hidden="true">grid_view</span>Heatmap
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}

const BLOCKER_LABEL = {
  EMAIL_NOT_VERIFIED: 'Email not confirmed',
  NO_LESSONS_REMAINING: 'No lessons left',
  NO_PACKAGE: 'Never bought a package',
  NO_ORGANISATION: 'No organisation set',
  UNKNOWN: 'Could not read balance',
}

// One taught (Convex) lesson row; expanding it reveals the keyword bank editor
// for exactly this lesson — the only place keywords are edited on this page.
function TaughtLessonRow({ lesson, student }) {
  const [open, setOpen] = useState(false)
  const [keywords, setKeywords] = useState(null)
  const [form, setForm] = useState(emptyKeyword)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!open || keywords !== null) return
    let cancelled = false
    queryAdminConvex('students:listKeywords', { lessonId: lesson._id })
      .then(rows => { if (!cancelled) setKeywords(rows || []) })
      .catch(() => { if (!cancelled) setKeywords([]) })
    return () => { cancelled = true }
  }, [open])

  async function addKeyword(e) {
    e.preventDefault()
    if (!form.word.trim()) return
    const word = form.word.trim()
    const translation = form.translation.trim() || word
    const topics = form.topics.split(',').map(t => t.trim()).filter(Boolean)
    await mutateAdminConvex('students:createKeyword', {
      lessonId: lesson._id, studentId: student._id,
      organizationId: lesson.organizationId || student.organizationId,
      word, translation,
      definitionEn: form.definitionEn.trim() || `Working definition for ${word}.`,
      definitionPl: form.definitionPl.trim() || translation,
      exampleEn: form.exampleEn.trim() || `We practised "${word}" in today's lesson.`,
      examplePl: form.examplePl.trim() || translation,
      ipa: form.ipa.trim(), stressUK: form.stressUK.trim(), stressUS: form.stressUS.trim(),
      topics: topics.length ? topics : lesson.topics || ['General English'],
      collocations: {},
    })
    const rows = await queryAdminConvex('students:listKeywords', { lessonId: lesson._id })
    setKeywords(rows || [])
    setForm(emptyKeyword)
    setNotice('Keyword added.')
  }

  async function removeKeyword(keywordId) {
    await mutateAdminConvex('students:deleteKeyword', { keywordId })
    setKeywords(rows => rows.filter(row => row._id !== keywordId))
    setNotice('Keyword removed.')
  }

  return (
    <div className="rounded-xl border" style={{ borderColor: open ? 'var(--sa-violet-600)' : 'var(--sa-border)',
      background: 'var(--sa-surface)' }}>
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span className="font-mono text-xs" style={{ color: 'var(--sa-text-muted)', width: 84, flexShrink: 0 }}>{lesson.date}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--sa-text)' }}>{lesson.title}</span>
        {open && keywords !== null && <span className="sa-badge sa-badge-processing">{keywords.length} kw</span>}
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sa-text-muted)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          {notice && <p className="text-xs font-semibold" style={{ color: 'var(--sa-good)' }}>{notice}</p>}
          {keywords === null ? (
            <p className="sa-empty-hint text-xs">Loading keyword bank…</p>
          ) : (
            <>
              <div className="max-h-72 space-y-0 overflow-auto rounded-xl border" style={{ borderColor: 'var(--sa-border)' }}>
                {keywords.length === 0 ? (
                  <p className="sa-empty-hint p-4">No keywords on this lesson yet.</p>
                ) : keywords.map(k => (
                  <div key={k._id} className="flex items-start justify-between gap-3 border-b px-3 py-2.5" style={{ borderColor: 'var(--sa-border)' }}>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--sa-text)' }}>{k.word}</p>
                      <p className="text-xs" style={{ color: 'var(--sa-text)' }}>{k.translation || k.definitionEn}</p>
                    </div>
                    <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.25rem 0.5rem' }}
                      onClick={() => removeKeyword(k._id)}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
              <form className="grid gap-2" onSubmit={addKeyword}>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input className="sa-input" style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }} placeholder="Keyword / phrase"
                    value={form.word} onChange={e => setForm(f => ({ ...f, word: e.target.value }))} />
                  <input className="sa-input" style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }} placeholder="Polish translation"
                    value={form.translation} onChange={e => setForm(f => ({ ...f, translation: e.target.value }))} />
                  <input className="sa-input" style={{ padding: '0.45rem 0.7rem', fontSize: '0.8rem' }} placeholder="Example in English"
                    value={form.exampleEn} onChange={e => setForm(f => ({ ...f, exampleEn: e.target.value }))} />
                </div>
                <div>
                  <button type="submit" className="sa-btn sa-btn-primary" style={{ padding: '0.35rem 0.9rem' }} disabled={!form.word.trim()}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>new_label</span>
                    Add keyword
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}


// Search-first student selector — built for hundreds of students. Type to
// filter by name / slug / CEFR; click to select. The selected student stays
// visible in the closed control.
function StudentSelect({ students, value, onPick }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const selected = students.find(s => s._id === value)
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? students.filter(s => `${s.name} ${s.slug} ${s.level}`.toLowerCase().includes(needle))
    : students
  return (
    <div style={{ position: 'relative', maxWidth: 460 }}>
      <button type="button" onClick={() => { setOpen(o => !o); setQ('') }}
        className="flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left"
        style={{ cursor: 'pointer', borderColor: 'var(--sa-border)', background: 'var(--sa-surface)' }}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
          style={{ background: 'var(--sa-violet-600)', color: 'var(--sa-surface)' }}>
          {(selected?.name || '?').slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold" style={{ color: 'var(--sa-text)' }}>
            {selected ? selected.name : 'Choose a student…'}
          </span>
          {selected && (
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--sa-text-muted)' }}>
              {selected.level || '?'} · {selected.slug}
            </span>
          )}
        </span>
        <span className="text-xs" style={{ color: 'var(--sa-text-muted)' }}>{students.length} students</span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sa-text-muted)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-2xl border"
          style={{ background: 'var(--sa-surface)', borderColor: 'var(--sa-border)',
            boxShadow: 'var(--sa-shadow-pop)' }}>
          <div className="p-2">
            <input autoFocus type="search" className="sa-input" placeholder="Search name, slug or level…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 && <p className="sa-empty-hint p-3">No students match.</p>}
            {filtered.map(s => (
              <button key={s._id} type="button"
                onClick={() => { onPick(s._id); setOpen(false); setQ('') }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
                style={{ background: s._id === value ? 'var(--sa-violet-100)' : 'none', border: 'none', cursor: 'pointer' }}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                  style={{ background: 'var(--sa-surface-soft)', color: 'var(--sa-text)' }}>
                  {(s.name || '?').slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: 'var(--sa-text)' }}>{s.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--sa-text-muted)' }}>
                    {s.level || '?'} · {s.slug}
                  </span>
                </span>
                {s._id === value && <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sa-violet-600)' }}>check</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
