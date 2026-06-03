import { useEffect, useState, useMemo } from 'react'
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary.jsx'
import { useAdminAuth, queryAdminConvex } from '../../contexts/AdminAuthContext.jsx'

const navigationItems = [
  { label: 'Dashboard', to: '/admin', icon: 'space_dashboard' },
  { label: 'Calendar', to: '/admin/calendar', icon: 'calendar_month' },
  { label: 'Students', to: '/admin/students', icon: 'school' },
  { label: 'Courses', to: '/admin/courses', icon: 'auto_stories' },
  { label: 'Settings', to: '/admin/settings', icon: 'settings' },
]

function initialsFromName(name) {
  if (!name) return 'EM'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || 'EM'
}

export default function AdminLayout() {
  const location = useLocation()
  const params = useParams()
  const { adminUser, isSuperadmin } = useAdminAuth()
  const [org, setOrg] = useState(null)
  const [viewedStudentOrg, setViewedStudentOrg] = useState(null)

  // Resolve the acting admin's organization (runs once on login).
  useEffect(() => {
    if (!adminUser?.organizationId) { setOrg(null); return }
    let cancelled = false
    queryAdminConvex('students:getOrganization', { orgId: adminUser.organizationId })
      .then(o => { if (!cancelled) setOrg(o) })
      .catch(() => { if (!cancelled) setOrg(null) })
    return () => { cancelled = true }
  }, [adminUser?.organizationId])

  // When a superadmin views a specific student, reflect THAT student's org
  // in the header so the banner matches what's on screen.
  const viewedSlug = params?.slug
  useEffect(() => {
    if (!isSuperadmin || !viewedSlug) { setViewedStudentOrg(null); return }
    let cancelled = false
    queryAdminConvex('students:getStudentBySlug', { slug: viewedSlug })
      .then(s => {
        if (!s?.organizationId) return setViewedStudentOrg(null)
        return queryAdminConvex('students:getOrganization', { orgId: s.organizationId })
      })
      .then(o => { if (!cancelled && o) setViewedStudentOrg(o) })
      .catch(() => { if (!cancelled) setViewedStudentOrg(null) })
    return () => { cancelled = true }
  }, [isSuperadmin, viewedSlug])

  const displayOrg = viewedStudentOrg || org
  const orgName = displayOrg?.name || (isSuperadmin ? 'English Metropolis' : 'Admin')
  const orgInitials = useMemo(() => initialsFromName(orgName), [orgName])

  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    const hadLight = root.classList.contains('light')
    root.classList.remove('dark')
    root.classList.add('light')
    return () => {
      root.classList.remove('light')
      if (hadDark) root.classList.add('dark')
      if (hadLight) root.classList.add('light')
    }
  }, [])

  // Auth gate — never render school data without a logged-in admin session
  // (mirrors the SuperadminLayout gate).
  if (!adminUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `
          radial-gradient(ellipse 70% 50% at 85% -5%, rgba(2,132,199,0.10), transparent 60%),
          radial-gradient(ellipse 55% 45% at 0% 15%, rgba(37,99,235,0.07), transparent 55%),
          radial-gradient(ellipse 80% 60% at 50% 115%, rgba(56,189,248,0.08), transparent 60%),
          linear-gradient(180deg, #FBFDFF 0%, #F4F8FD 55%, #EFF5FC 100%)`,
      }}
    >
      <div className="sticky-header-shell px-4 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="glass-panel sticky top-0 z-40 rounded-none border border-white/60 border-t-0 editorial-shadow px-4 py-3 sm:top-3 sm:rounded-[2rem] sm:border-t sm:px-6 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <Link to="/admin" className="flex items-center gap-3 min-w-0 group">
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-[1rem] sm:rounded-[1.25rem] bg-gradient-to-br from-sky-500 to-blue-700 shadow-[0_18px_45px_-22px_rgba(2,132,199,0.85)] transition-transform duration-300 group-hover:scale-105">
                  <span className="material-symbols-outlined text-white">apartment</span>
                </div>
                <div className="min-w-0">
                  <p className="font-label text-[10px] sm:text-xs font-bold uppercase tracking-[0.32em] text-sky-600">School Administration</p>
                  <h1 className="font-headline text-xl sm:text-3xl text-slate-900 truncate leading-tight">
                    {orgName}<span className="italic text-sky-600">.</span>
                  </h1>
                </div>
              </Link>

              {isSuperadmin && (
                <Link
                  to="/admin/superadmin"
                  className="hidden sm:flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sky-700 hover:bg-sky-100 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  <span className="font-label text-xs font-bold uppercase tracking-[0.18em]">Superadmin</span>
                </Link>
              )}

              <div className="flex items-center gap-2 sm:gap-3 rounded-full border border-white/70 bg-white/70 px-2 py-1.5 sm:px-2.5 sm:py-2 backdrop-blur-xl shadow-[0_14px_35px_-26px_rgba(15,23,42,0.45)]">
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700">
                  <span className="font-headline text-sm sm:text-base text-white">{orgInitials}</span>
                </div>
                <div className="hidden sm:block pr-2">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Admin Panel</p>
                  <p className="text-sm font-semibold text-slate-900 leading-tight">{orgName}</p>
                </div>
              </div>
            </div>
          </header>
        </div>
      </div>

      <main className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="glass-panel h-fit rounded-[2rem] border border-white/50 p-3 editorial-shadow lg:sticky lg:top-28">
            <p className="font-label px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Navigation</p>
            <div className="mt-3 space-y-1.5">
              {navigationItems.map((item) => {
                const isActive =
                  (item.label === 'Dashboard' && location.pathname === '/admin') ||
                  (item.label === 'Calendar' && location.pathname === '/admin/calendar') ||
                  (item.label === 'Students' && (location.pathname.startsWith('/admin/student/') || location.pathname === '/admin/students')) ||
                  (item.label === 'Courses' && location.pathname === '/admin/courses') ||
                  (item.label === 'Settings' && location.pathname === '/admin/settings')
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={isActive
                      ? 'flex items-center gap-3 rounded-[1.25rem] bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-3 text-white shadow-[0_16px_35px_-20px_rgba(2,132,199,0.9)] transition-all duration-300'
                      : 'flex items-center gap-3 rounded-[1.25rem] px-4 py-3 text-slate-500 transition-all duration-300 hover:bg-white/90 hover:text-sky-700 hover:shadow-[0_14px_30px_-24px_rgba(15,23,42,0.4)] hover:-translate-y-0.5'}
                  >
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    <span className="font-label text-xs font-bold uppercase tracking-[0.2em]">{item.label}</span>
                    {isActive && <span className="ml-auto block h-1.5 w-1.5 rounded-full bg-white/90" />}
                  </Link>
                )
              })}
            </div>
            <div className="mt-5 mx-3 mb-2 border-t border-slate-200/70 pt-4">
              <p className="font-label text-[9px] font-bold uppercase tracking-[0.26em] text-slate-300">Powered by</p>
              <p className="mt-1 font-headline text-sm text-slate-500">English <span className="italic text-sky-600">Metropolis</span></p>
            </div>
          </aside>

          <div className="space-y-6">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  )
}
