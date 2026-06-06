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

function buildWarmHeadline(students) {
  if (!students.length) return 'Welcome to Conversa — once your first student is enrolled, their progress will appear here.'
  const activeCount = students.length
  const totalLessons = students.reduce((sum, s) => sum + (s.lessonCount || 0), 0)
  const scores = students.map(s => s.latestAnalysis?.overallScore || 0).filter(v => v > 0)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const top = [...students].sort((a, b) => (b.latestAnalysis?.overallScore || 0) - (a.latestAnalysis?.overallScore || 0))[0]
  const topName = top?.student?.name?.split(' ')[0] || ''
  return `Your ${activeCount} learner${activeCount === 1 ? '' : 's'} ${activeCount === 1 ? 'has' : 'have'} completed ${totalLessons} lesson${totalLessons === 1 ? '' : 's'} to date, with a rolling attainment average of ${avg}/100 across the CEFR assessment scale.${topName ? ` ${topName} is currently demonstrating the strongest learning outcomes — the roster below details every learner's progression.` : ''}`
}

// Time-of-day greeting for the editorial hero.
function greetingWord() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Circular attainment ring — light/blue treatment of the v3 score ring.
function ScoreRing({ value, size = 96 }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(2,132,199,0.12)" strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="url(#conversaRingGrad)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <defs>
          <linearGradient id="conversaRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="ca-num text-3xl text-slate-900 leading-none">{pct}</span>
        <span className="font-label text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">/ 100</span>
      </div>
    </div>
  )
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

  // CEFR band distribution
  const bandDistribution = students.reduce((acc, s) => {
    const band = s.student?.level || 'N/A'
    acc[band] = (acc[band] || 0) + 1
    return acc
  }, {})

  const statCards = [
    { label: 'Active Learners', value: db?.activeStudents || 0, icon: 'group', note: 'currently enrolled' },
    { label: 'Lessons Delivered', value: totalLessons, icon: 'history_edu', note: 'across all learners' },
    { label: 'Vocabulary Acquired', value: totalKeywords, icon: 'menu_book', note: 'words & phrases taught' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Editorial hero — school overview ─────────────────────── */}
      <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/50 px-6 py-8 sm:px-10 sm:py-10 editorial-shadow">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 50% 70% at 95% 0%, rgba(14,165,233,0.10), transparent 60%),
              radial-gradient(ellipse 40% 50% at 5% 100%, rgba(37,99,235,0.07), transparent 55%)`,
          }}
        />
        <div className="relative">
          <p className="font-label text-xs font-bold uppercase tracking-[0.32em] text-sky-600">School Overview · {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}</p>
          <h2 className="mt-3 font-headline text-4xl sm:text-5xl text-slate-900 leading-[1.05]">
            {greetingWord()}, <span className="italic text-sky-600">{org?.name || 'Conversa'}.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600 max-w-3xl">{buildWarmHeadline(students)}</p>

          <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-stretch">
            {/* Attainment ring */}
            <div className="liquid-glass-card metric-card-enter flex items-center gap-5 rounded-[1.5rem] px-6 py-5" style={{ animationDelay: '0ms' }}>
              <ScoreRing value={avgScore} />
              <div>
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">School Attainment</p>
                <p className="mt-1 font-headline text-xl text-slate-900">CEFR Average</p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {Object.entries(bandDistribution).map(([band, count]) => (
                    <span key={band} className="inline-flex items-center gap-1.5">
                      <CefrBadge band={band} />
                      <span className="text-xs text-slate-500">× {count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              {statCards.map((card, i) => (
                <div
                  key={card.label}
                  className="liquid-glass-card metric-card-enter group rounded-[1.5rem] px-5 py-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgba(2,132,199,0.5)]"
                  style={{ animationDelay: `${(i + 1) * 90}ms` }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-[0.875rem] bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700 transition-transform duration-300 group-hover:scale-110">
                    <span className="material-symbols-outlined text-xl">{card.icon}</span>
                  </div>
                  <p className="mt-4 ca-num text-4xl text-slate-900">{card.value}</p>
                  <p className="mt-1 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700">{card.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{card.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Monthly lesson count — the billing figure ─────────────── */}
      {monthlyStats?.currentMonth && (
        <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-sky-200/70 px-6 py-7 sm:px-8 editorial-shadow">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50/80 via-white/40 to-blue-50/60" />
          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">
                  Billing Period · {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}
                </p>
                <h3 className="mt-1 font-headline text-3xl text-slate-900">Lessons This <span className="italic text-sky-600">Month</span></h3>
              </div>
              <Link to="/admin/calendar"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)] transition-all duration-300">
                <span className="material-symbols-outlined text-lg">calendar_month</span>
                Open calendar & scheduling
              </Link>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="liquid-glass-card metric-card-enter rounded-[1.5rem] px-5 py-4" style={{ animationDelay: '0ms' }}>
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Completed Lessons</p>
                <p className="mt-2 ca-num text-5xl text-slate-900">{monthlyStats.currentMonth.completedLessons}</p>
              </div>
              <div className="liquid-glass-card metric-card-enter rounded-[1.5rem] px-5 py-4" style={{ animationDelay: '90ms' }}>
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Late Cancellations</p>
                <p className={`mt-2 ca-num text-5xl ${monthlyStats.currentMonth.lateCancellations ? 'text-rose-600' : 'text-slate-900'}`}>
                  {monthlyStats.currentMonth.lateCancellations}
                </p>
                <p className="mt-1 text-xs text-slate-500">Cancelled &lt; 24h before start — billed</p>
              </div>
              <div className="liquid-glass-card metric-card-enter rounded-[1.5rem] px-5 py-4 ring-1 ring-sky-200/60" style={{ animationDelay: '180ms' }}>
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Total Billable</p>
                <p className="mt-2 ca-num text-5xl bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">{monthlyStats.currentMonth.billableTotal}</p>
                <p className="mt-1 text-xs text-slate-500">Completed + late cancellations</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Student roster ─────────────────────────────────────────── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
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
