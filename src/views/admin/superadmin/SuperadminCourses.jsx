// SuperadminCourses — the STUDENTS workspace (renamed from "Courses",
// 2026-07-09). Pick a student → their course loads with everything editable:
// course material, scheduling, and taught lessons. Keyword editing appears
// ONLY inside a specific opened lesson — never as a standing panel.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import CoursePublisher from './CoursePublisher.jsx'

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
  const [allocN, setAllocN] = useState(10)
  const [allocVersion, setAllocVersion] = useState(0)

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

  if (loading) return <p style={{ color: '#8A83AE' }}>Loading…</p>

  return (
    <div className="space-y-5">
      {error && (
        <div className="sa-card" style={{ padding: '0.8rem 1.1rem', borderColor: 'rgba(251,113,133,0.4)' }}>
          <span style={{ color: '#FB7185', fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}

      {/* ── Student selector — search-first, scales to hundreds ── */}
      <StudentSelect students={students} value={studentId} onPick={setStudentId} />

      {student && (
        <>
          {/* ── Student header strip ── */}
          <div className="sa-card" style={{ padding: '0.9rem 1.2rem', display: 'flex', flexWrap: 'wrap',
            alignItems: 'center', gap: '1.25rem' }}>
            <div>
              <p className="sa-stat-label">Student</p>
              <p className="text-lg font-black" style={{ color: '#F4F0FF' }}>{student.name}</p>
            </div>
            <div><p className="sa-stat-label">CEFR</p><p className="sa-stat-value" style={{ fontSize: '1.2rem' }}>{student.level || '—'}</p></div>
            <div><p className="sa-stat-label">Taught lessons</p><p className="sa-stat-value" style={{ fontSize: '1.2rem' }}>{taught.length}</p></div>
            <div>
              <p className="sa-stat-label">Lesson allocation</p>
              <p style={{ marginTop: '0.25rem', fontSize: '0.95rem', fontWeight: 700,
                color: remaining > 0 ? '#34D399' : '#FB7185' }}>
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
                  <span className="text-xs font-semibold" style={{ color: '#FCD34D' }}>
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
              <Link to={`/admin/superadmin/students/${student.slug}/heatmap`} className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.9rem', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>local_fire_department</span>
                Heatmap
              </Link>
              <a href={`/app/${student.slug}`} target="_blank" rel="noopener" className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.9rem', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                Student panel
              </a>
            </div>
          </div>

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
              <span className="text-xs" style={{ color: '#8A83AE' }}>open a lesson to edit its keyword bank</span>
            </div>
            <div className="sa-card-body space-y-1.5">
              {taught.length === 0 ? (
                <p className="text-sm" style={{ color: '#8A83AE' }}>No taught lessons yet.</p>
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
    <div className="rounded-xl border" style={{ borderColor: open ? 'rgba(217,70,239,0.3)' : 'rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.02)' }}>
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span className="font-mono text-xs" style={{ color: '#8A83AE', width: 84, flexShrink: 0 }}>{lesson.date}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: '#F4F0FF' }}>{lesson.title}</span>
        {open && keywords !== null && <span className="sa-badge sa-badge-processing">{keywords.length} kw</span>}
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#8A83AE' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          {notice && <p className="text-xs font-semibold" style={{ color: '#34D399' }}>{notice}</p>}
          {keywords === null ? (
            <p className="text-xs" style={{ color: '#8A83AE' }}>Loading keyword bank…</p>
          ) : (
            <>
              <div className="max-h-72 space-y-0 overflow-auto rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                {keywords.length === 0 ? (
                  <p className="p-4 text-sm" style={{ color: '#8A83AE' }}>No keywords on this lesson yet.</p>
                ) : keywords.map(k => (
                  <div key={k._id} className="flex items-start justify-between gap-3 border-b px-3 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#F4F0FF' }}>{k.word}</p>
                      <p className="text-xs" style={{ color: '#CEC8E8' }}>{k.translation || k.definitionEn}</p>
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
        style={{ cursor: 'pointer', borderColor: 'rgba(217,70,239,0.4)', background: 'rgba(255,255,255,0.03)' }}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #D946EF)', color: '#fff' }}>
          {(selected?.name || '?').slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold" style={{ color: '#F4F0FF' }}>
            {selected ? selected.name : 'Choose a student…'}
          </span>
          {selected && (
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#8A83AE' }}>
              {selected.level || '?'} · {selected.slug}
            </span>
          )}
        </span>
        <span className="text-xs" style={{ color: '#8A83AE' }}>{students.length} students</span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8A83AE' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-2xl border"
          style={{ background: 'rgba(10,6,24,0.98)', borderColor: 'rgba(255,255,255,0.12)',
            boxShadow: '0 18px 50px -18px rgba(0,0,0,0.7)' }}>
          <div className="p-2">
            <input autoFocus type="search" className="sa-input" placeholder="Search name, slug or level…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 && <p className="p-3 text-xs" style={{ color: '#8A83AE' }}>No students match.</p>}
            {filtered.map(s => (
              <button key={s._id} type="button"
                onClick={() => { onPick(s._id); setOpen(false); setQ('') }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
                style={{ background: s._id === value ? 'rgba(217,70,239,0.1)' : 'none', border: 'none', cursor: 'pointer' }}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#CEC8E8' }}>
                  {(s.name || '?').slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: '#F4F0FF' }}>{s.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: '#8A83AE' }}>
                    {s.level || '?'} · {s.slug}
                  </span>
                </span>
                {s._id === value && <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#D946EF' }}>check</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
