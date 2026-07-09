import { Link, NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'
import { useAdminAuth } from '../../../contexts/AdminAuthContext.jsx'
import { FONT, G, NIGHT as T } from '../../../design/v3/tokens.js'

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

// Superadmin console chrome — Metropolis v3 (deep violet night, glossy glass,
// purple→fuchsia→pink). All tab screens style themselves with the sa-* classes
// defined here, so this file IS the console's design system.
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
    <div className="min-h-screen" style={{ background: T.pageBg, fontFamily: FONT.body }}>
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          background: 'rgba(6, 4, 16, 0.82)',
          borderColor: T.border,
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/admin/superadmin" className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: G.brand, boxShadow: '0 12px 32px -12px rgba(217, 70, 239, 0.6)' }}
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: 24 }}>shield_person</span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: T.brandInk }}>Superadmin</p>
              <h1 className="text-xl font-bold truncate" style={{ color: T.text, letterSpacing: '-0.01em', fontFamily: FONT.display }}>English Metro</h1>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-[11px] uppercase tracking-widest" style={{ color: T.textDim }}>Signed in as</p>
              <p className="text-sm font-semibold" style={{ color: T.text }}>{adminUser.name}</p>
            </div>
            <button
              type="button"
              onClick={() => { adminLogout(); window.location.assign('/login') }}
              className="rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest transition hover:scale-[1.03]"
              style={{ borderColor: 'rgba(251, 113, 133, 0.35)', color: T.rose, background: 'rgba(251, 113, 133, 0.08)' }}
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
          color: ${T.textSoft};
          background: ${T.surface};
          border: 1px solid ${T.border};
        }
        .nav-pill-idle:hover {
          color: ${T.text};
          background: ${T.surfaceHi};
          border-color: ${T.borderHi};
        }
        .nav-pill-active {
          color: #fff;
          background: ${G.brand};
          border: 1px solid rgba(240, 171, 252, 0.45);
          box-shadow: 0 10px 30px -10px rgba(217, 70, 239, 0.6);
        }
        .sa-card {
          background: ${G.glass}, ${T.surface};
          border: 1px solid ${T.border};
          border-radius: 1.25rem;
          backdrop-filter: blur(14px);
          box-shadow: ${T.shadowSm};
        }
        .sa-card-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid ${T.borderSoft};
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
          color: ${T.textDim};
        }
        .sa-card-body { padding: 1.25rem; color: ${T.textSoft}; }
        .sa-stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.14em; color: ${T.textDim}; }
        .sa-stat-value {
          font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem;
          font-family: ${FONT.display};
          background: ${G.brand};
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .sa-input {
          width: 100%;
          background: ${T.surfaceLo};
          border: 1px solid ${T.border};
          color: ${T.text};
          border-radius: 0.75rem;
          padding: 0.7rem 0.9rem;
          font-size: 0.9rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .sa-input:focus { border-color: ${T.fuchsia}; box-shadow: 0 0 0 1px rgba(217,70,239,0.35); }
        .sa-input::placeholder { color: ${T.textMute}; }
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
          background: ${G.brand};
          color: #fff;
          box-shadow: 0 12px 30px -10px rgba(217, 70, 239, 0.55);
        }
        .sa-btn-primary:hover { transform: translateY(-1px) scale(1.02); }
        .sa-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .sa-btn-ghost {
          background: ${T.surface};
          color: ${T.textSoft};
          border-color: ${T.border};
        }
        .sa-btn-ghost:hover { background: ${T.surfaceHi}; color: ${T.text}; }
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
        .sa-badge-queued { background: ${T.surfaceHi}; color: ${T.textSoft}; }
        .sa-badge-processing { background: rgba(96, 165, 250, 0.16); color: ${T.sky}; }
        .sa-badge-awaiting_review { background: rgba(252, 211, 77, 0.14); color: ${T.amber}; }
        .sa-badge-committed { background: rgba(52, 211, 153, 0.14); color: ${T.emerald}; }
        .sa-badge-failed { background: rgba(251, 113, 133, 0.14); color: ${T.rose}; }
      `}</style>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
