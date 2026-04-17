import { useEffect, useState, useMemo } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary.jsx'
import { useAdminAuth, queryAdminConvex } from '../../contexts/AdminAuthContext.jsx'

const navigationItems = [
  { label: 'Dashboard', to: '/admin', icon: 'space_dashboard' },
  { label: 'Students', to: '/admin/students', icon: 'school' },
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="sticky-header-shell px-4 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="glass-panel sticky top-0 z-40 rounded-none border border-white/60 border-t-0 editorial-shadow px-4 py-3 sm:top-3 sm:rounded-[2rem] sm:border-t sm:px-6 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <Link to="/admin" className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-[1rem] sm:rounded-[1.25rem] border border-white/60 bg-white/80 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                  <span className="material-symbols-outlined text-sky-700">apartment</span>
                </div>
                <div className="min-w-0">
                  <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-700">{orgName} School Admin</p>
                  <h1 className="font-headline text-xl sm:text-3xl text-slate-900 truncate">{orgName} Admin</h1>
                </div>
              </Link>

              {isSuperadmin && (
                <Link
                  to="/admin/superadmin"
                  className="hidden sm:flex items-center gap-2 rounded-[1rem] border border-sky-200 bg-sky-50 px-3 py-2 text-sky-700 hover:bg-sky-100 transition"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  <span className="font-label text-xs font-bold uppercase tracking-[0.18em]">Superadmin</span>
                </Link>
              )}

              <div className="flex items-center gap-2 sm:gap-3 rounded-[1.25rem] border border-white/60 bg-white/70 px-3 py-2 sm:px-4 sm:py-3 backdrop-blur-xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="liquid-glass-panel flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-[0.875rem] sm:rounded-[1rem]">
                    <span className="font-headline text-sm sm:text-base text-white">{orgInitials}</span>
                  </div>
                  <div className="hidden sm:block">
                    <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Admin Panel</p>
                    <p className="text-sm font-semibold text-slate-900">{orgName}</p>
                  </div>
                </div>
              </div>
            </div>
          </header>
        </div>
      </div>

      <main className="px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px,minmax(0,1fr)]">
          <aside className="glass-panel h-fit rounded-[2rem] border border-white/50 p-4 editorial-shadow lg:sticky lg:top-28">
            <p className="font-label px-2 text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Navigation</p>
            <div className="mt-3 space-y-2">
              {navigationItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className={                   (item.label === 'Dashboard' && location.pathname === '/admin') ||
                    (item.label === 'Students' && (location.pathname.startsWith('/admin/student/') || location.pathname === '/admin/students')) ||
                    (item.label === 'Settings' && location.pathname === '/admin/settings')
                      ? 'flex items-center justify-between rounded-[1.25rem] border border-sky-200 bg-sky-50 text-sky-700 px-4 py-3 transition'
                      : 'flex items-center justify-between rounded-[1.25rem] border border-slate-200/70 bg-white/80 text-slate-600 px-4 py-3 transition hover:border-sky-200 hover:text-sky-700'
                  }
                >
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    <span className="font-label text-xs font-bold uppercase tracking-[0.2em]">{item.label}</span>
                  </span>
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </Link>
              ))}
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
