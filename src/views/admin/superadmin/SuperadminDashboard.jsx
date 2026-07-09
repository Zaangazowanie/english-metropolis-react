import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import CoursePublisher from './CoursePublisher.jsx'

const emptyKeyword = {
  word: '',
  translation: '',
  definitionEn: '',
  definitionPl: '',
  exampleEn: '',
  examplePl: '',
  ipa: '',
  stressUK: '',
  stressUS: '',
  topics: '',
}


function formatDate(msOrDate) {
  if (!msOrDate) return '-'
  if (typeof msOrDate === 'number') return new Date(msOrDate).toLocaleString()
  return String(msOrDate)
}

function safeDetails(raw) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' · ')
  } catch {
    return raw
  }
}


export default function SuperadminDashboard() {
  const [stats, setStats] = useState(null)
  const [ingestionStats, setIngestionStats] = useState(null)
  const [students, setStudents] = useState([])
  const [orgs, setOrgs] = useState([])
  const [recentLessons, setRecentLessons] = useState([])
  const [recentJobs, setRecentJobs] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentLessons, setStudentLessons] = useState([])
  const [selectedLessonId, setSelectedLessonId] = useState('')
  const [lessonKeywords, setLessonKeywords] = useState([])
  const [keywordForm, setKeywordForm] = useState(emptyKeyword)
  const [loading, setLoading] = useState(true)
  const [panelLoading, setPanelLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      // allSettled: one failing stat must never blank the whole console
      // (the 2026-07-09 outage was getGlobalStats alone taking the page down).
      const results = await Promise.allSettled([
        queryAdminConvex('students:getGlobalStats', {}),
        queryAdminConvex('ingestion:getIngestionStats', {}),
        queryAdminConvex('students:listStudents', {}),
        queryAdminConvex('students:listLessons', { limit: 24 }),
        queryAdminConvex('ingestion:listIngestionJobs', { limit: 8 }),
        queryAdminConvex('students:listOrganizations', {}),
        queryAdminConvex('ingestion:listAuditLog', { limit: 12 }),
      ])
      if (cancelled) return
      const [globalStats, pipelineStats, studentRows, lessonRows, jobs, organizations, audit] =
        results.map(r => (r.status === 'fulfilled' ? r.value : null))
      setStats(globalStats)
      setIngestionStats(pipelineStats)
      setStudents(studentRows || [])
      setRecentLessons(lessonRows || [])
      setRecentJobs(jobs || [])
      setOrgs(organizations || [])
      setAuditEvents(audit || [])
      const firstActive = (studentRows || []).find(s => s.status === 'active') || (studentRows || [])[0]
      if (firstActive) setSelectedStudentId(firstActive._id)
      const failures = results.filter(r => r.status === 'rejected')
      if (failures.length) {
        setError(`${failures.length} console panel(s) failed to load: ${failures.map(f => String(f.reason?.message || f.reason).slice(0, 80)).join(' · ')}`)
      }
      setLoading(false)
      // Keyword total: fat enriched docs can't be counted in one Convex
      // execution — sum the paginated counter in the background instead.
      try {
        let cursor = null, total = 0
        for (let i = 0; i < 250; i++) {   // ~29k keywords ≈ 72 pages today; headroom for growth
          const page = await queryAdminConvex('students:countKeywordsPage', cursor ? { cursor } : {})
          total += page.count
          if (page.isDone || cancelled) break
          cursor = page.cursor
        }
        if (!cancelled) setStats(s => ({ ...(s || {}), totalKeywords: total }))
      } catch { /* tile keeps its fallback */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedStudentId) return
    let cancelled = false
    setPanelLoading(true)
    setNotice('')
    Promise.all([
      queryAdminConvex('students:listLessons', { studentId: selectedStudentId, limit: 80 }),
      queryAdminConvex('students:listKeywords', { studentId: selectedStudentId, limit: 5000 }),
    ])
      .then(([lessons, keywords]) => {
        if (cancelled) return
        setStudentLessons(lessons)
        setSelectedLessonId(current => {
          if (current && lessons.some(l => l._id === current)) return current
          return lessons[0]?._id || ''
        })
        if (!lessons[0]) setLessonKeywords(keywords.slice(0, 60))
      })
      .catch(e => { if (!cancelled) setError(e.message || String(e)) })
      .finally(() => { if (!cancelled) setPanelLoading(false) })
    return () => { cancelled = true }
  }, [selectedStudentId])

  useEffect(() => {
    if (!selectedLessonId) {
      setLessonKeywords([])
      return
    }
    let cancelled = false
    setPanelLoading(true)
    queryAdminConvex('students:listKeywords', { lessonId: selectedLessonId })
      .then(rows => { if (!cancelled) setLessonKeywords(rows) })
      .catch(e => { if (!cancelled) setError(e.message || String(e)) })
      .finally(() => { if (!cancelled) setPanelLoading(false) })
    return () => { cancelled = true }
  }, [selectedLessonId, studentLessons])

  const selectedStudent = students.find(s => s._id === selectedStudentId)
  const selectedLesson = studentLessons.find(l => l._id === selectedLessonId)
  const studentById = useMemo(() => new Map(students.map(s => [s._id, s])), [students])
  const activeStudents = students.filter(s => s.status === 'active').length
  const dueSoonLessons = recentLessons.filter(l => l.date >= new Date().toISOString().slice(0, 10)).length
  const latestJobStatus = recentJobs[0]?.status?.replace('_', ' ') || 'quiet'

  async function addKeyword(e) {
    e.preventDefault()
    if (!selectedLesson || !selectedStudent || !keywordForm.word.trim()) return
    const word = keywordForm.word.trim()
    const translation = keywordForm.translation.trim() || word
    const topics = keywordForm.topics
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
    await mutateAdminConvex('students:createKeyword', {
      lessonId: selectedLesson._id,
      studentId: selectedStudent._id,
      organizationId: selectedLesson.organizationId || selectedStudent.organizationId,
      word,
      translation,
      definitionEn: keywordForm.definitionEn.trim() || `Working definition for ${word}.`,
      definitionPl: keywordForm.definitionPl.trim() || translation,
      exampleEn: keywordForm.exampleEn.trim() || `We practised "${word}" in today's lesson.`,
      examplePl: keywordForm.examplePl.trim() || translation,
      ipa: keywordForm.ipa.trim(),
      stressUK: keywordForm.stressUK.trim(),
      stressUS: keywordForm.stressUS.trim(),
      topics: topics.length ? topics : selectedLesson.topics || ['General English'],
      collocations: {},
    })
    const rows = await queryAdminConvex('students:listKeywords', { lessonId: selectedLesson._id })
    setLessonKeywords(rows)
    setKeywordForm(emptyKeyword)
    setNotice('Keyword added to the student bank.')
  }

  async function removeKeyword(keywordId) {
    await mutateAdminConvex('students:deleteKeyword', { keywordId })
    setLessonKeywords(rows => rows.filter(row => row._id !== keywordId))
    setNotice('Keyword removed.')
  }

  if (loading) return <p style={{ color: 'rgba(203,213,225,0.7)' }}>Loading console...</p>
  // A partial failure renders as a banner over the working panels — never a
  // blank page (the console must degrade, not disappear).
  const errorBanner = error ? (
    <div className="sa-card" style={{ padding: '0.8rem 1.1rem', marginBottom: '1rem',
      borderColor: 'rgba(248,113,113,0.4)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <span className="material-symbols-outlined" style={{ color: '#fca5a5', fontSize: 18 }}>warning</span>
      <span style={{ color: '#fca5a5', fontSize: '0.85rem' }}>{error}</span>
    </div>
  ) : null

  return (
    <div className="space-y-6">
      {errorBanner}
      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="sa-card overflow-hidden">
          <div className="sa-card-body" style={{ padding: 0 }}>
            <div className="p-6 sm:p-7" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.28), rgba(56,189,248,0.16))' }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: '#c4b5fd' }}>
                English Metro Superadmin Console
              </p>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl" style={{ color: '#f8fafc', letterSpacing: '-0.03em' }}>
                Activity, lessons, materials, and vocab in one place.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: 'rgba(226,232,240,0.78)' }}>
                Use this command center to check platform health, set course material, publish taught lessons, and keep student keyword banks clean without leaving the superadmin area.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-0 border-t sm:grid-cols-4" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
              {[
                ['Active students', activeStudents],
                ['Lessons', stats?.totalLessons ?? recentLessons.length],
                ['Keywords', stats?.totalKeywords ?? '…'],
                ['Pipeline', latestJobStatus],
              ].map(([label, value]) => (
                <div key={label} className="p-5" style={{ borderRight: '1px solid rgba(148,163,184,0.08)' }}>
                  <p className="sa-stat-label">{label}</p>
                  <p className="sa-stat-value">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Operational pulse</h2>
            <Link to="/admin/superadmin/audit" className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a5f3fc' }}>
              Audit
            </Link>
          </div>
          <div className="sa-card-body space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="sa-stat-label">Organizations</p>
                <p className="sa-stat-value">{orgs.length}</p>
              </div>
              <div>
                <p className="sa-stat-label">Upcoming rows</p>
                <p className="sa-stat-value">{dueSoonLessons}</p>
              </div>
            </div>
            <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(148,163,184,0.14)', background: 'rgba(15,23,42,0.42)' }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c4b5fd' }}>Ingestion</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {['queued', 'processing', 'awaiting_review'].map(key => (
                  <div key={key}>
                    <p className="text-lg font-black" style={{ color: '#f8fafc' }}>{ingestionStats?.[key] ?? 0}</p>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.74)' }}>{key.replace('_', ' ')}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Course material</h2>
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

        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Keyword control</h2>
            <Link to={selectedStudent?.slug ? `/admin/superadmin/students/${selectedStudent.slug}/heatmap` : '/admin/superadmin/students'} className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a5f3fc' }}>
              Heatmap
            </Link>
          </div>
          <div className="sa-card-body space-y-4">
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

            <div className="max-h-[24rem] overflow-auto rounded-2xl border" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
              {lessonKeywords.length === 0 ? (
                <p className="p-5 text-sm" style={{ color: 'rgba(148,163,184,0.74)' }}>No keywords on this lesson yet.</p>
              ) : (
                lessonKeywords.map(keyword => (
                  <div key={keyword._id} className="flex items-start justify-between gap-3 border-b p-4" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <div>
                      <p className="font-bold" style={{ color: '#f8fafc' }}>{keyword.word}</p>
                      <p className="text-sm" style={{ color: 'rgba(203,213,225,0.72)' }}>{keyword.translation || keyword.definitionEn}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.72)' }}>
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

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Recent lessons</h2>
            <Link to="/admin/superadmin/students" className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a5f3fc' }}>
              Students
            </Link>
          </div>
          <div className="sa-card-body p-0">
            {recentLessons.map(lesson => {
              const student = studentById.get(lesson.studentId)
              return (
                <button
                  key={lesson._id}
                  type="button"
                  className="flex w-full items-center justify-between gap-4 border-b px-5 py-4 text-left transition hover:bg-slate-800/40"
                  style={{ borderColor: 'rgba(148,163,184,0.08)' }}
                  onClick={() => {
                    setSelectedStudentId(lesson.studentId)
                    setSelectedLessonId(lesson._id)
                  }}
                >
                  <span>
                    <span className="block font-semibold" style={{ color: '#f8fafc' }}>{lesson.title}</span>
                    <span className="block text-xs" style={{ color: 'rgba(203,213,225,0.68)' }}>{student?.name || 'Unknown student'} · {lesson.date}</span>
                  </span>
                  <span className="sa-badge sa-badge-processing">{(lesson.materials || []).length} materials</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Live audit</h2>
            <Link to="/admin/superadmin/audit" className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a5f3fc' }}>
              Full log
            </Link>
          </div>
          <div className="sa-card-body space-y-3">
            {auditEvents.map(event => (
              <div key={event._id} className="rounded-2xl border p-4" style={{ borderColor: 'rgba(148,163,184,0.1)', background: 'rgba(15,23,42,0.36)' }}>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{event.action}</code>
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.72)' }}>{formatDate(event.timestamp)}</span>
                </div>
                <p className="mt-2 text-xs" style={{ color: 'rgba(203,213,225,0.68)' }}>
                  {event.targetType}{event.targetId ? ` · ${event.targetId.slice(0, 12)}...` : ''} {safeDetails(event.details) ? `· ${safeDetails(event.details)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
