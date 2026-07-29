import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { queryAdminConvex, useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
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

// Time-of-day greeting for the editorial hero.
function greetingWord() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { adminUser } = useAdminAuth()
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
          organizationId: adminUser?.organizationId,
        })
        if (!cancelled) setState({ loading: false, error: '', dashboard })
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: 'Failed to load school data.', dashboard: null })
      }
      // Monthly billing figures (completed lessons + billable late
      // cancellations) — non-blocking, the dashboard renders without it.
      try {
        const stats = await queryAdminConvex('scheduling:getMonthlyLessonStats', {
          organizationId: adminUser?.organizationId,
        })
        if (!cancelled) setMonthlyStats(stats)
      } catch {
        /* monthly strip simply hidden on failure */
      }
    }
    load()
    return () => { cancelled = true }
  }, [adminUser?.organizationId])

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

  // Compact "at a glance" KPIs — billing-forward, attainment demoted to one tile.
  const m = monthlyStats?.currentMonth
  const kpis = [
    { label: 'Active learners', value: db?.activeStudents || 0, icon: 'group' },
    { label: 'Lessons this month', value: m ? m.completedLessons : '—', icon: 'history_edu' },
    { label: 'Total billable', value: m ? m.billableTotal : '—', icon: 'receipt_long', highlight: true },
    { label: 'CEFR average', value: avgScore, suffix: ' /100', icon: 'insights' },
  ]
  const quickActions = [
    { label: 'Schedule a lesson', icon: 'event', to: '/admin/calendar', primary: true },
    { label: 'Add student', icon: 'person_add', to: '/admin/students' },
    { label: 'Courses', icon: 'auto_stories', to: '/admin/courses' },
    { label: 'Billing', icon: 'receipt_long', to: '/admin/billing' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Hero + quick actions ─────────────────────────────────── */}
      <section className="ca-hero glass-panel relative overflow-hidden rounded-[2rem] border border-white/50 px-6 py-8 sm:px-10 sm:py-9 editorial-shadow">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{
          background: `
            radial-gradient(ellipse 50% 70% at 95% 0%, rgba(14,165,233,0.10), transparent 60%),
            radial-gradient(ellipse 40% 50% at 5% 100%, rgba(37,99,235,0.07), transparent 55%)`,
        }} />
        <div className="relative">
          <p className="font-label text-xs font-bold uppercase tracking-[0.32em] text-sky-600">School Overview · {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}</p>
          <h2 className="mt-3 font-headline text-4xl sm:text-5xl text-slate-900 leading-[1.05]">
            {greetingWord()}, <span className="italic text-sky-600">{org?.name || 'Conversa'}.</span>
          </h2>
          <p className="mt-3 text-[15px] text-slate-600">
            {students.length
              ? `${db?.activeStudents || students.length} active learner${(db?.activeStudents || students.length) === 1 ? '' : 's'} · ${totalLessons} lessons delivered · ${totalKeywords} words taught`
              : 'Once your first learner is enrolled, their progress appears here.'}
          </p>

          {/* quick actions */}
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className={a.primary
                  ? 'group flex items-center gap-3 rounded-[1.25rem] org-brand-gradient px-5 py-4 text-white shadow-[0_18px_40px_-22px_rgba(2,132,199,0.9)] hover:-translate-y-0.5 transition-all duration-300'
                  : 'group flex items-center gap-3 rounded-[1.25rem] border border-white/70 bg-white/70 px-5 py-4 text-slate-700 hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700 transition-all duration-300'}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] transition-transform duration-300 group-hover:scale-110 ${a.primary ? 'bg-white/20 text-white' : 'bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700'}`}>
                  <span className="material-symbols-outlined text-xl">{a.icon}</span>
                </span>
                <span className="font-label text-xs font-bold uppercase tracking-[0.16em]">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── At a glance — compact KPIs (billing-forward) ─────────── */}
      <section className="ca-glance glass-panel rounded-[2rem] border border-white/50 px-5 py-5 sm:px-7 editorial-shadow">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-slate-400">At a glance · {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}</p>
          <Link to="/admin/billing" className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-sky-600 hover:text-sky-700">Billing details →</Link>
        </div>
        <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-[1.25rem] px-4 py-3.5 ${k.highlight ? 'bg-gradient-to-br from-sky-50 to-blue-50 ring-1 ring-sky-200/70' : 'bg-white/70 border border-white/70'}`}>
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-base ${k.highlight ? 'text-sky-600' : 'text-slate-400'}`}>{k.icon}</span>
                <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{k.label}</p>
              </div>
              <p className={`mt-1.5 ca-num text-2xl ${k.highlight ? 'text-sky-700' : 'text-slate-900'}`}>
                {k.value}{k.suffix ? <span className="text-sm text-slate-400">{k.suffix}</span> : null}
              </p>
            </div>
          ))}
        </div>
        {m?.lateCancellations ? (
          <p className="mt-3 text-xs text-slate-500">Total billable includes {m.lateCancellations} late cancellation{m.lateCancellations === 1 ? '' : 's'} and {m.noShows ?? 0} student no-show{m.noShows === 1 ? '' : 's'} (billed).</p>
        ) : null}
      </section>

      {/* ── Student roster ─────────────────────────────────────────── */}
      <section className="ca-roster glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Learners</p>
            <h3 className="mt-1 font-headline text-3xl text-slate-900">Student <span className="italic text-sky-600">Roster</span></h3>
            <p className="mt-2 text-sm text-slate-500 max-w-xl">Open any learner to review their full academic record — learning outcomes, lesson archive, vocabulary acquisition and downloadable progress reports.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2.5 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 transition">
              <span className="material-symbols-outlined text-slate-400 text-base">search</span>
              <input
                type="search"
                placeholder="Search learners..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-40"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-full border border-slate-200/70 bg-white/80 px-4 py-2.5 text-sm text-slate-700 focus:border-sky-300 focus:outline-none cursor-pointer"
            >
              <option value="name">Name</option>
              <option value="level">Level</option>
              <option value="lessons">Lessons</option>
              <option value="score">CEFR Score</option>
            </select>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {sorted.length ? sorted.map(({ student, lessonCount, keywordCount, latestAnalysis }, idx) => {
            const initials = String(student?.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
            const lastActivity = latestAnalysis?.createdAt ? daysAgo(latestAnalysis.createdAt) : null

            return (
              <button
                key={student?._id}
                type="button"
                onClick={() => navigate(`/admin/student/${student?.slug}`)}
                className="metric-card-enter group w-full liquid-glass-card rounded-[1.5rem] border border-white/60 px-5 py-5 text-left transition-all duration-300 hover:border-sky-200 hover:-translate-y-1 hover:shadow-[0_28px_56px_-32px_rgba(2,132,199,0.55)] cursor-pointer"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.125rem] bg-gradient-to-br from-sky-500 to-blue-700 shadow-[0_14px_30px_-16px_rgba(2,132,199,0.9)] transition-transform duration-300 group-hover:scale-105">
                      <span className="font-headline text-lg text-white">{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-headline text-xl text-slate-900 truncate">{student?.name}</p>
                      <div className="mt-1.5 flex items-center gap-2">
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

                  <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-7">
                    <div className="text-center">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Lessons</p>
                      <p className="mt-1 ca-num text-2xl text-slate-900">{lessonCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Vocabulary</p>
                      <p className="mt-1 ca-num text-2xl text-slate-900">{keywordCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Attainment</p>
                      <div className="mt-1 flex items-center gap-1">
                        <CefrBadge band={latestAnalysis?.cefrBand || '—'} score={latestAnalysis?.overallScore} />
                      </div>
                    </div>
                    {lastActivity && (
                      <div className="text-center hidden sm:block">
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Last Assessed</p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">{lastActivity}</p>
                      </div>
                    )}
                    <span className="ca-roster-arrow material-symbols-outlined text-slate-300 text-lg transition-all duration-300 group-hover:text-sky-600 group-hover:translate-x-1">arrow_forward</span>
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
