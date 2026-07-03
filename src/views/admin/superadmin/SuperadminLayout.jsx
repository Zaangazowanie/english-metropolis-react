import { Link, NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'
import { useAdminAuth } from '../../../contexts/AdminAuthContext.jsx'

const navigation = [
  { to: '/admin/superadmin', label: 'Console', icon: 'dashboard', end: true },
  { to: '/admin/superadmin/ingest', label: 'Ingest Lesson', icon: 'upload_file' },
  { to: '/admin/superadmin/jobs', label: 'Queue', icon: 'pending_actions' },
  { to: '/admin/superadmin/library', label: 'Library', icon: 'local_library' },
  { to: '/admin/superadmin/assignments', label: 'Assignments', icon: 'assignment_ind' },
  { to: '/admin/superadmin/pipelines', label: 'Pipelines', icon: 'monitor_heart' },
  { to: '/admin/superadmin/students', label: 'All Students', icon: 'person' },
  { to: '/admin/superadmin/groups', label: 'Groups', icon: 'groups' },
  { to: '/admin/superadmin/availability', label: 'Availability', icon: 'event_available' },
  { to: '/admin/superadmin/audit', label: 'Audit Log', icon: 'history' },
  { to: '/admin/superadmin/salary', label: 'Salary', icon: 'payments' },
]

export default function SuperadminLayout() {
  const { adminUser, isSuperadmin, adminLogout } = useAdminAuth()
  const location = useLocation()

  if (!adminUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!isSuperadmin) {
    return <Navigate to="/admin" replace />
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #0b1220 0%, #0f172a 60%, #0b1220 100%)' }}>
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          background: 'rgba(10, 14, 25, 0.88)',
          borderColor: 'rgba(148, 163, 184, 0.12)',
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/admin/superadmin" className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #d946ef 0%, #8b5cf6 50%, #38bdf8 100%)', boxShadow: '0 12px 32px -12px rgba(139, 92, 246, 0.55)' }}
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: 24 }}>shield_person</span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: 'rgba(216, 180, 254, 0.85)' }}>Superadmin</p>
              <h1 className="text-xl font-bold truncate" style={{ color: '#f8fafc', letterSpacing: '-0.01em' }}>English Metropolis</h1>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-[11px] uppercase tracking-widest" style={{ color: 'rgba(148, 163, 184, 0.7)' }}>Signed in as</p>
              <p className="text-sm font-semibold" style={{ color: '#f1f5f9' }}>{adminUser.name}</p>
            </div>
            <button
              type="button"
              onClick={() => { adminLogout(); window.location.assign('/login') }}
              className="rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest transition hover:scale-[1.03]"
              style={{ borderColor: 'rgba(248, 113, 113, 0.35)', color: 'rgba(254, 202, 202, 0.95)', background: 'rgba(239, 68, 68, 0.08)' }}
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:px-8" style={{ scrollbarWidth: 'none' }}>
          {navigation.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition whitespace-nowrap ${
                  isActive ? 'nav-pill-active' : 'nav-pill-idle'
                }`
              }
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <style>{`
        .nav-pill-idle {
          color: rgba(203, 213, 225, 0.75);
          background: rgba(148, 163, 184, 0.08);
          border: 1px solid rgba(148, 163, 184, 0.15);
        }
        .nav-pill-idle:hover {
          color: #f1f5f9;
          background: rgba(148, 163, 184, 0.14);
        }
        .nav-pill-active {
          color: #0b1220;
          background: linear-gradient(135deg, #c4b5fd, #a5f3fc);
          border: 1px solid rgba(168, 85, 247, 0.4);
          box-shadow: 0 10px 30px -10px rgba(139, 92, 246, 0.55);
        }
        .sa-card {
          background: linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 1.25rem;
          backdrop-filter: blur(12px);
        }
        .sa-card-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .sa-card-header h2 {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(203, 213, 225, 0.8);
        }
        .sa-card-body { padding: 1.25rem; color: #e2e8f0; }
        .sa-stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.14em; color: rgba(148, 163, 184, 0.8); }
        .sa-stat-value { font-size: 1.75rem; font-weight: 800; color: #f8fafc; margin-top: 0.25rem; }
        .sa-input {
          width: 100%;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.22);
          color: #e2e8f0;
          border-radius: 0.75rem;
          padding: 0.7rem 0.9rem;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .sa-input:focus { border-color: #a78bfa; background: rgba(15, 23, 42, 0.9); }
        .sa-input::placeholder { color: rgba(148, 163, 184, 0.55); }
        .sa-textarea { min-height: 7rem; line-height: 1.55; font-size: 0.85rem; }
        .sa-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1.4rem;
          border-radius: 999px;
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          border: 1px solid transparent;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .sa-btn-primary {
          background: linear-gradient(135deg, #c4b5fd, #7dd3fc);
          color: #0b1220;
          box-shadow: 0 12px 30px -10px rgba(139, 92, 246, 0.5);
        }
        .sa-btn-primary:hover { transform: translateY(-1px) scale(1.02); }
        .sa-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .sa-btn-ghost {
          background: rgba(148, 163, 184, 0.1);
          color: #e2e8f0;
          border-color: rgba(148, 163, 184, 0.2);
        }
        .sa-btn-ghost:hover { background: rgba(148, 163, 184, 0.18); }
        .sa-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .sa-badge-queued { background: rgba(148, 163, 184, 0.18); color: #cbd5e1; }
        .sa-badge-processing { background: rgba(56, 189, 248, 0.18); color: #7dd3fc; }
        .sa-badge-awaiting_review { background: rgba(251, 191, 36, 0.18); color: #fcd34d; }
        .sa-badge-committed { background: rgba(74, 222, 128, 0.18); color: #86efac; }
        .sa-badge-failed { background: rgba(248, 113, 113, 0.18); color: #fca5a5; }
      `}</style>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
