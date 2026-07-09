import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import MiniCalendar from './MiniCalendar.jsx'



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
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [ingestionStats, setIngestionStats] = useState(null)
  const [students, setStudents] = useState([])
  const [orgs, setOrgs] = useState([])
  const [recentLessons, setRecentLessons] = useState([])
  const [recentJobs, setRecentJobs] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [month, setMonth] = useState({ total: 0, done: 0, upcoming: 0, next: [], marks: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
    let cancelled = false
    const ORGS = ['js7cb568fpf7qhkqqe55a7jz5s83sadf', 'js779cs2vjwb2c9yjc3a7t619n84zcp8']
    Promise.allSettled(ORGS.map(o => queryAdminConvex('scheduling:listBookings', { organizationId: o })))
      .then(results => {
        if (cancelled) return
        const rows = results.flatMap(r => (r.status === 'fulfilled' ? r.value || [] : []))
        const now = Date.now()
        const ym = new Date().toISOString().slice(0, 7)
        const live = rows.filter(b => b.status === 'scheduled' || b.status === 'completed')
        const inMonth = live.filter(b => String(b.dateWarsaw || '').startsWith(ym))
        const upcoming = live.filter(b => b.startUtc > now).sort((a, b) => a.startUtc - b.startUtc)
        const marks = {}
        for (const b of live) marks[b.dateWarsaw] = (marks[b.dateWarsaw] || 0) + 1
        setMonth({
          total: inMonth.length,
          done: inMonth.filter(b => b.endUtc < now).length,
          upcoming: upcoming.length,
          next: upcoming.slice(0, 5),
          marks,
        })
      })
    return () => { cancelled = true }
  }, [])

  const studentById = useMemo(() => new Map(students.map(s => [s._id, s])), [students])
  const activeStudents = students.filter(s => s.status === 'active').length
  const dueSoonLessons = recentLessons.filter(l => l.date >= new Date().toISOString().slice(0, 10)).length
  const latestJobStatus = recentJobs[0]?.status?.replace('_', ' ') || 'quiet'

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

      <section className="grid gap-6 xl:grid-cols-[1fr_0.55fr]">
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>This month</h2>
            <Link to="/admin/superadmin/courses" className="text-xs font-bold uppercase tracking-widest" style={{ color: '#F0ABFC' }}>
              Courses &amp; scheduling →
            </Link>
          </div>
          <div className="sa-card-body">
            <div className="grid grid-cols-3 gap-3">
              <div><p className="sa-stat-label">Lessons this month</p><p className="sa-stat-value">{month.total}</p></div>
              <div><p className="sa-stat-label">Taught</p><p className="sa-stat-value">{month.done}</p></div>
              <div><p className="sa-stat-label">Coming up</p><p className="sa-stat-value">{month.upcoming}</p></div>
            </div>
            {month.next.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="sa-stat-label">Next lessons</p>
                {month.next.map(b => (
                  <div key={b._id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#34D399' }}>event</span>
                    <span style={{ color: '#F4F0FF', fontWeight: 600 }}>{b.dateWarsaw} {b.timeWarsaw}</span>
                    <span style={{ color: '#8A83AE' }}>{b.studentName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="sa-card" style={{ alignSelf: 'start' }}>
          <div className="sa-card-header"><h2>Booking calendar</h2></div>
          <div className="sa-card-body" style={{ display: 'flex', justifyContent: 'center' }}>
            <MiniCalendar value="" onPick={() => {}} marks={month.marks} minToday={false} />
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
                  onClick={() => navigate('/admin/superadmin/courses')}
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
