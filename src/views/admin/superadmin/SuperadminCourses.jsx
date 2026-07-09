// SuperadminCourses — "Courses & Scheduling" page (split out of the Console
// dashboard 2026-07-09; the dashboard was too crowded to schedule from).
// Left: the course wizard (set course material + schedule lessons).
// Right: per-student keyword control against the selected lesson.

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
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentLessons, setStudentLessons] = useState([])
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [lessonKeywords, setLessonKeywords] = useState([])
  const [keywordForm, setKeywordForm] = useState(emptyKeyword)
  const [panelLoading, setPanelLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listStudents', {})
      .then(rows => {
        if (!alive) return
        setStudents(rows || [])
        const firstActive = (rows || []).find(s => s.status === 'active')
        if (firstActive) setSelectedStudentId(firstActive._id)
      })
      .catch(e => { if (alive) setError(e.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!selectedStudentId) return
    let cancelled = false
    setPanelLoading(true)
    setNotice('')
    queryAdminConvex('students:listLessons', { studentId: selectedStudentId, limit: 80 })
      .then(lessons => {
        if (cancelled) return
        setStudentLessons(lessons || [])
        setSelectedLessonId(current => {
          if (current && (lessons || []).some(l => l._id === current)) return current
          return lessons?.[0]?._id || ''
        })
      })
      .catch(e => { if (!cancelled) setError(e.message || String(e)) })
      .finally(() => { if (!cancelled) setPanelLoading(false) })
    return () => { cancelled = true }
  }, [selectedStudentId])

  useEffect(() => {
    if (!selectedLessonId) { setLessonKeywords([]); return }
    let cancelled = false
    queryAdminConvex('students:listKeywords', { lessonId: selectedLessonId })
      .then(rows => { if (!cancelled) setLessonKeywords(rows || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedLessonId])

  const selectedStudent = students.find(s => s._id === selectedStudentId)
  const selectedLesson = studentLessons.find(l => l._id === selectedLessonId)

  async function addKeyword(e) {
    e.preventDefault()
    if (!selectedLesson || !selectedStudent || !keywordForm.word.trim()) return
    const word = keywordForm.word.trim()
    const translation = keywordForm.translation.trim() || word
    const topics = keywordForm.topics.split(',').map(t => t.trim()).filter(Boolean)
    await mutateAdminConvex('students:createKeyword', {
      lessonId: selectedLesson._id,
      studentId: selectedStudent._id,
      organizationId: selectedLesson.organizationId || selectedStudent.organizationId,
      word, translation,
      definitionEn: keywordForm.definitionEn.trim() || `Working definition for ${word}.`,
      definitionPl: keywordForm.definitionPl.trim() || translation,
      exampleEn: keywordForm.exampleEn.trim() || `We practised "${word}" in today's lesson.`,
      examplePl: keywordForm.examplePl.trim() || translation,
      ipa: keywordForm.ipa.trim(), stressUK: keywordForm.stressUK.trim(), stressUS: keywordForm.stressUS.trim(),
      topics: topics.length ? topics : selectedLesson.topics || ['General English'],
      collocations: {},
    })
    const rows = await queryAdminConvex('students:listKeywords', { lessonId: selectedLesson._id })
    setLessonKeywords(rows || [])
    setKeywordForm(emptyKeyword)
    setNotice('Keyword added to the student bank.')
  }

  async function removeKeyword(keywordId) {
    await mutateAdminConvex('students:deleteKeyword', { keywordId })
    setLessonKeywords(rows => rows.filter(row => row._id !== keywordId))
    setNotice('Keyword removed.')
  }

  if (loading) return <p style={{ color: '#8A83AE' }}>Loading…</p>

  return (
    <div className="space-y-6">
      {error && (
        <div className="sa-card" style={{ padding: '0.8rem 1.1rem', borderColor: 'rgba(251,113,133,0.4)' }}>
          <span style={{ color: '#FB7185', fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Course material &amp; scheduling</h2>
            <span className="sa-badge sa-badge-committed" title="Only library PDF decks can be set as course material — no manual links">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>picture_as_pdf</span>
              PDF library only
            </span>
          </div>
          <div className="sa-card-body">
            <CoursePublisher
              students={students}
              selectedStudentId={selectedStudentId}
              setSelectedStudentId={setSelectedStudentId}
            />
            {notice && <p className="mt-3 text-sm font-semibold" style={{ color: '#34D399' }}>{notice}</p>}
          </div>
        </div>

        <div className="sa-card" style={{ alignSelf: 'start' }}>
          <div className="sa-card-header">
            <h2>Keyword control</h2>
            <Link to={selectedStudent?.slug ? `/admin/superadmin/students/${selectedStudent.slug}/heatmap` : '/admin/superadmin/students'} className="text-xs font-bold uppercase tracking-widest" style={{ color: '#F0ABFC' }}>
              Heatmap
            </Link>
          </div>
          <div className="sa-card-body space-y-4">
            <label className="flex flex-col gap-1">
              <span className="sa-stat-label">Taught lesson</span>
              <select className="sa-input" value={selectedLessonId}
                onChange={e => setSelectedLessonId(e.target.value)} disabled={!studentLessons.length}>
                {!studentLessons.length && <option value="">No lessons yet</option>}
                {studentLessons.map(lesson => (
                  <option key={lesson._id} value={lesson._id}>{lesson.date} · {lesson.title}</option>
                ))}
              </select>
            </label>
            <form className="grid gap-3" onSubmit={addKeyword}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="sa-input" placeholder="Keyword / phrase" value={keywordForm.word} onChange={e => setKeywordForm(f => ({ ...f, word: e.target.value }))} />
                <input className="sa-input" placeholder="Polish translation" value={keywordForm.translation} onChange={e => setKeywordForm(f => ({ ...f, translation: e.target.value }))} />
                <input className="sa-input" placeholder="English definition" value={keywordForm.definitionEn} onChange={e => setKeywordForm(f => ({ ...f, definitionEn: e.target.value }))} />
                <input className="sa-input" placeholder="Polish definition" value={keywordForm.definitionPl} onChange={e => setKeywordForm(f => ({ ...f, definitionPl: e.target.value }))} />
              </div>
              <input className="sa-input" placeholder="Topics, comma separated" value={keywordForm.topics} onChange={e => setKeywordForm(f => ({ ...f, topics: e.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="sa-input" placeholder="Example in English" value={keywordForm.exampleEn} onChange={e => setKeywordForm(f => ({ ...f, exampleEn: e.target.value }))} />
                <input className="sa-input" placeholder="Example in Polish" value={keywordForm.examplePl} onChange={e => setKeywordForm(f => ({ ...f, examplePl: e.target.value }))} />
              </div>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={!selectedLessonId || !keywordForm.word.trim() || panelLoading}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>new_label</span>
                Add keyword
              </button>
            </form>

            <div className="max-h-[24rem] overflow-auto rounded-2xl border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {lessonKeywords.length === 0 ? (
                <p className="p-5 text-sm" style={{ color: '#8A83AE' }}>No keywords on this lesson yet.</p>
              ) : (
                lessonKeywords.map(keyword => (
                  <div key={keyword._id} className="flex items-start justify-between gap-3 border-b p-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div>
                      <p className="font-bold" style={{ color: '#F4F0FF' }}>{keyword.word}</p>
                      <p className="text-sm" style={{ color: '#CEC8E8' }}>{keyword.translation || keyword.definitionEn}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-widest" style={{ color: '#8A83AE' }}>
                        {(keyword.topics || []).join(', ') || 'General'}
                      </p>
                    </div>
                    <button type="button" className="sa-btn sa-btn-ghost" onClick={() => removeKeyword(keyword._id)}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
