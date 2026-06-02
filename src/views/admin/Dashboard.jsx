import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { queryAdminConvex } from '../../contexts/AdminAuthContext.jsx'
import { CefrBadge } from '../../components/analytics/AnalyticsPrimitives.jsx'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// formatDate + CefrBadge consolidated to AnalyticsPrimitives (Tier 3 cleanup,
// 2026-05-02). Dashboard.jsx had verbatim copies. daysAgo kept local because
// its phrasing differs from StudentDetail.jsx ('Today' vs 'today').

function daysAgo(value) {
  if (!value) return null
  const ts = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(ts)) return null
  const diff = Math.floor((Date.now() - ts) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return `${Math.floor(diff / 30)}mo ago`
}

function buildWarmHeadline(students) {
  if (!students.length) return 'Welcome to Conversa — once your first student is enrolled, their progress will appear here.'
  const activeCount = students.length
  const totalLessons = students.reduce((sum, s) => sum + (s.lessonCount || 0), 0)
  const scores = students.map(s => s.latestAnalysis?.overallScore || 0).filter(v => v > 0)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const top = [...students].sort((a, b) => (b.latestAnalysis?.overallScore || 0) - (a.latestAnalysis?.overallScore || 0))[0]
  const topName = top?.student?.name?.split(' ')[0] || ''
  return `You have ${activeCount} active learner${activeCount === 1 ? '' : 's'} at Conversa, collectively through ${totalLessons} lesson${totalLessons === 1 ? '' : 's'} with a rolling CEFR average of ${avg}/100.${topName ? ` ${topName} is currently showing the strongest recent performance — the roster below walks you through every student in detail.` : ''}`
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: '', dashboard: null })
  const [monthlyStats, setMonthlyStats] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState({ loading: true, error: '', dashboard: null })
      try {
        const dashboard = await queryAdminConvex('students:getSchoolDashboard', {
          organizationId: 'js7cb568fpf7qhkqqe55a7jz5s83sadf',
        })
        if (!cancelled) setState({ loading: false, error: '', dashboard })
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: 'Failed to load school data.', dashboard: null })
      }
      // Monthly billing figures (completed lessons + billable late
      // cancellations) — non-blocking, the dashboard renders without it.
      try {
        const stats = await queryAdminConvex('scheduling:getMonthlyLessonStats', {
          organizationId: 'js7cb568fpf7qhkqqe55a7jz5s83sadf',
        })
        if (!cancelled) setMonthlyStats(stats)
      } catch {
        /* monthly strip simply hidden on failure */
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (state.loading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow animate-pulse">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-48 rounded bg-slate-200" />
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-[1.25rem] bg-slate-100" />)}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-[2rem] bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="glass-panel rounded-[2rem] border border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load dashboard</h2>
        <p className="mt-2 text-sm text-rose-700">{state.error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer">
          Retry
        </button>
      </div>
    )
  }

  const db = state.dashboard
  const students = db?.students || []
  const org = db?.organization

  const filtered = students.filter(s => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [s.student?.name, s.student?.level, s.student?.slug, ...(s.student?.tags || [])]
      .join(' ').toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return (a.student?.name || '').localeCompare(b.student?.name || '')
    if (sortBy === 'level') return (a.student?.level || '').localeCompare(b.student?.level || '')
    if (sortBy === 'lessons') return (b.lessonCount || 0) - (a.lessonCount || 0)
    if (sortBy === 'score') return (b.latestAnalysis?.overallScore || 0) - (a.latestAnalysis?.overallScore || 0)
    return 0
  })

  const totalLessons = students.reduce((sum, s) => sum + (s.lessonCount || 0), 0)
  const totalKeywords = students.reduce((sum, s) => sum + (s.keywordCount || 0), 0)
  const avgScore = students.length
    ? Math.round(students.reduce((sum, s) => sum + (s.latestAnalysis?.overallScore || 0), 0) / students.length)
    : 0

  // CEFR band distribution
  const bandDistribution = students.reduce((acc, s) => {
    const band = s.student?.level || 'N/A'
    acc[band] = (acc[band] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* School overview — warm welcome */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow">
        <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-700">School Overview</p>
        <h2 className="mt-1 font-headline text-3xl text-slate-900">{org?.name || 'Conversa'}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 max-w-3xl">{buildWarmHeadline(students)}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3">
            <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Active Students</p>
            <p className="mt-2 font-headline text-3xl text-slate-900">{db?.activeStudents || 0}</p>
          </div>
          <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3">
            <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Total Lessons</p>
            <p className="mt-2 font-headline text-3xl text-slate-900">{totalLessons}</p>
          </div>
          <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3">
            <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Vocabulary Bank</p>
            <p className="mt-2 font-headline text-3xl text-slate-900">{totalKeywords}</p>
          </div>
          <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3">
            <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Avg CEFR Score</p>
            <p className="mt-2 font-headline text-3xl text-slate-900">{avgScore}</p>
          </div>
        </div>

        {/* CEFR distribution */}
        {Object.keys(bandDistribution).length > 0 && (
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">CEFR Distribution:</p>
            {Object.entries(bandDistribution).map(([band, count]) => (
              <span key={band} className="inline-flex items-center gap-1.5">
                <CefrBadge band={band} />
                <span className="text-xs text-slate-500">× {count}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Monthly lesson count — the billing figure (completed lessons this
          month + billable late cancellations). Clearly shown per spec. */}
      {monthlyStats?.currentMonth && (
        <section className="glass-panel rounded-[2rem] border border-sky-200/70 bg-sky-50/40 px-6 py-6 editorial-shadow">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-700">
                {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}
              </p>
              <h3 className="mt-1 font-headline text-2xl text-slate-900">Lessons This Month</h3>
            </div>
            <Link to="/admin/calendar"
              className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 transition">
              <span className="material-symbols-outlined text-lg">calendar_month</span>
              Open calendar & scheduling
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3">
              <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Completed Lessons</p>
              <p className="mt-2 font-headline text-4xl text-slate-900">{monthlyStats.currentMonth.completedLessons}</p>
            </div>
            <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3">
              <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Late Cancellations</p>
              <p className={`mt-2 font-headline text-4xl ${monthlyStats.currentMonth.lateCancellations ? 'text-rose-600' : 'text-slate-900'}`}>
                {monthlyStats.currentMonth.lateCancellations}
              </p>
              <p className="mt-1 text-xs text-slate-500">Cancelled &lt; 24h before start — billed</p>
            </div>
            <div className="liquid-glass-card rounded-[1.25rem] px-4 py-3">
              <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Total Billable</p>
              <p className="mt-2 font-headline text-4xl text-sky-700">{monthlyStats.currentMonth.billableTotal}</p>
              <p className="mt-1 text-xs text-slate-500">Completed + late cancellations</p>
            </div>
          </div>
        </section>
      )}

      {/* Student roster */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-4 editorial-shadow sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-700">Students</p>
            <h3 className="mt-1 font-headline text-2xl text-slate-900">Student Roster</h3>
            <p className="mt-1 text-xs text-slate-500">Click any card to open the full student dashboard — progress history, lesson archive, vocabulary and downloadable notes.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
            <input
              type="search"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-slate-200/60 bg-white/60 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100 w-48"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border border-slate-200/60 bg-white/60 px-3 py-2 text-sm text-slate-700 focus:border-sky-300 focus:outline-none cursor-pointer"
            >
              <option value="name">Name</option>
              <option value="level">Level</option>
              <option value="lessons">Lessons</option>
              <option value="score">CEFR Score</option>
            </select>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {sorted.length ? sorted.map(({ student, lessonCount, keywordCount, latestAnalysis }) => {
            const initials = String(student?.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
            const lastActivity = latestAnalysis?.createdAt ? daysAgo(latestAnalysis.createdAt) : null

            return (
              <button
                key={student?._id}
                type="button"
                onClick={() => navigate(`/admin/student/${student?.slug}`)}
                className="w-full liquid-glass-card rounded-[1.5rem] border border-white/60 px-4 py-4 text-left transition hover:border-sky-200 hover:shadow-md cursor-pointer"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-gradient-to-br from-blue-600 to-indigo-700 shadow-sm">
                      <span className="font-headline text-base text-white">{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-headline text-lg text-slate-900 truncate">{student?.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <CefrBadge band={student?.level || 'N/A'} />
                        {student?.targetLevel && <span className="text-[10px] font-label text-slate-400">→ {student.targetLevel}</span>}
                        {student?.status === 'active' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-label font-bold uppercase tracking-[0.16em] text-emerald-700">
                            <span className="block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="text-center">
                      <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Lessons</p>
                      <p className="mt-1 font-headline text-xl text-slate-900">{lessonCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Keywords</p>
                      <p className="mt-1 font-headline text-xl text-slate-900">{keywordCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">CEFR</p>
                      <div className="mt-1 flex items-center gap-1">
                        <CefrBadge band={latestAnalysis?.cefrBand || '—'} score={latestAnalysis?.overallScore} />
                      </div>
                    </div>
                    {lastActivity && (
                      <div className="text-center">
                        <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Last Activity</p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">{lastActivity}</p>
                      </div>
                    )}
                    <span className="material-symbols-outlined text-slate-300 text-lg">chevron_right</span>
                  </div>
                </div>
              </button>
            )
          }) : (
            <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-4 py-6 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">search_off</span>
              <p className="mt-2 text-sm text-slate-500">{search ? `No students match "${search}"` : 'No students enrolled yet.'}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
