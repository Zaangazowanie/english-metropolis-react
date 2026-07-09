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

  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listStudents', {})
      .then(rows => {
        if (!alive) return
        const roster = (rows || []).filter(s => s.status !== 'archived')
        setStudents(roster)
        if (roster[0]) setStudentId(roster[0]._id)
      })
      .catch(e => { if (alive) setError(e.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    queryAdminConvex('students:listLessons', { studentId, limit: 80 })
      .then(rows => { if (!cancelled) setTaught(rows || []) })
      .catch(() => { if (!cancelled) setTaught([]) })
    return () => { cancelled = true }
  }, [studentId])

  const student = students.find(s => s._id === studentId) || null

  if (loading) return <p style={{ color: '#8A83AE' }}>Loading…</p>

  return (
    <div className="space-y-5">
      {error && (
        <div className="sa-card" style={{ padding: '0.8rem 1.1rem', borderColor: 'rgba(251,113,133,0.4)' }}>
          <span style={{ color: '#FB7185', fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}

      {/* ── Student picker — always visible, one row of cards ── */}
      <div className="flex flex-wrap gap-2">
        {students.map(s => (
          <button key={s._id} type="button" onClick={() => setStudentId(s._id)}
            className="flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-left transition hover:-translate-y-0.5"
            style={{
              cursor: 'pointer',
              borderColor: s._id === studentId ? 'rgba(217,70,239,0.55)' : 'rgba(255,255,255,0.09)',
              background: s._id === studentId ? 'rgba(217,70,239,0.08)' : 'rgba(255,255,255,0.03)',
            }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
              style={{ background: s._id === studentId ? 'linear-gradient(135deg, #8B5CF6, #D946EF)' : 'rgba(255,255,255,0.08)',
                color: s._id === studentId ? '#fff' : '#8A83AE' }}>
              {(s.name || '?').slice(0, 1)}
            </span>
            <span>
              <span className="block text-sm font-bold" style={{ color: s._id === studentId ? '#F4F0FF' : '#CEC8E8' }}>{s.name}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#8A83AE' }}>
                {s.level || '?'} · {s.slug}
              </span>
            </span>
          </button>
        ))}
      </div>

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
                setSelectedStudentId={setStudentId} fixedStudent={student} />
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
