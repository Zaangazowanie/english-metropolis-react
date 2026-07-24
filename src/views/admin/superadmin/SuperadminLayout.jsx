import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { SchoolProvider, SchoolSwitcher } from './SchoolShared.jsx'
import { useAdminAuth, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import './console.css'

const ROOT = '/admin/superadmin'

// Information architecture — docs/console/REVAMP-SPEC.md §3.
// `group: null` renders an ungrouped link at the top of the rail.
export const NAV_GROUPS = [
  {
    group: null,
    items: [{ to: ROOT, label: 'Overview', icon: 'dashboard', end: true }],
  },
  {
    // Schools own teachers, students and courses, so this group sits above
    // Academic: it is where those records are created, not just browsed.
    group: 'School',
    items: [
      { to: `${ROOT}/school/schools`, label: 'Schools', icon: 'apartment' },
      { to: `${ROOT}/school/teachers`, label: 'Teachers', icon: 'co_present' },
      { to: `${ROOT}/school/students`, label: 'Students', icon: 'person_add' },
      { to: `${ROOT}/school/preview`, label: 'Student preview', icon: 'visibility' },
    ],
  },
  {
    group: 'Academic',
    items: [
      { to: `${ROOT}/academic/students`, label: 'Students', icon: 'school' },
      { to: `${ROOT}/academic/roster`, label: 'Roster', icon: 'group' },
      { to: `${ROOT}/academic/groups`, label: 'Groups', icon: 'groups' },
      { to: `${ROOT}/academic/schedule`, label: 'Schedule', icon: 'event_available' },
      { to: `${ROOT}/academic/assignments`, label: 'Assignments', icon: 'assignment_ind' },
    ],
  },
  {
    group: 'Curriculum',
    items: [
      { to: `${ROOT}/curriculum/library`, label: 'Library', icon: 'local_library' },
      { to: `${ROOT}/curriculum/ingest`, label: 'Ingest', icon: 'upload_file' },
      { to: `${ROOT}/curriculum/queue`, label: 'Queue', icon: 'pending_actions' },
    ],
  },
  {
    group: 'Comms',
    items: [
      { to: `${ROOT}/comms/inbox`, label: 'Inbox', icon: 'inbox' },
      { to: `${ROOT}/comms/templates`, label: 'Templates', icon: 'article' },
      { to: `${ROOT}/comms/sequences`, label: 'Sequences', icon: 'forward_to_inbox' },
    ],
  },
  {
    group: 'CRM',
    items: [
      { to: `${ROOT}/crm/contacts`, label: 'Contacts', icon: 'contacts' },
      { to: `${ROOT}/crm/companies`, label: 'Companies', icon: 'domain' },
      { to: `${ROOT}/crm/pipeline`, label: 'Pipeline', icon: 'view_kanban' },
    ],
  },
  {
    group: 'Growth',
    items: [
      { to: `${ROOT}/growth/campaigns`, label: 'Campaigns', icon: 'campaign' },
      { to: `${ROOT}/growth/adverts`, label: 'Adverts', icon: 'ad_units' },
      { to: `${ROOT}/growth/seo`, label: 'SEO', icon: 'travel_explore' },
    ],
  },
  {
    group: 'Website',
    items: [
      { to: `${ROOT}/website/pages`, label: 'Pages', icon: 'web' },
      { to: `${ROOT}/website/deploys`, label: 'Deploys', icon: 'rocket_launch' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { to: `${ROOT}/finance/revenue`, label: 'Revenue', icon: 'payments' },
      { to: `${ROOT}/finance/invoices`, label: 'Invoices', icon: 'receipt_long' },
      { to: `${ROOT}/finance/payroll`, label: 'Payroll', icon: 'account_balance_wallet' },
    ],
  },
  {
    group: 'People',
    items: [
      { to: `${ROOT}/people/team`, label: 'Team', icon: 'badge' },
      { to: `${ROOT}/people/recruiting`, label: 'Recruiting', icon: 'person_search' },
    ],
  },
  {
    group: 'System',
    items: [
      { to: `${ROOT}/system/pipelines`, label: 'Pipelines', icon: 'monitor_heart' },
      { to: `${ROOT}/system/audit`, label: 'Audit', icon: 'history' },
      { to: `${ROOT}/system/integrations`, label: 'Integrations', icon: 'cable' },
    ],
  },
]

const FLAT_NAV = NAV_GROUPS.flatMap(g => g.items.map(item => ({ ...item, group: g.group })))

const COLLAPSE_KEY = 'em.console.sidebarCollapsed'

function readCollapsed() {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

// Longest matching nav entry wins, so /academic/groups/:id still resolves to Groups.
function matchNav(pathname) {
  let best = null
  for (const item of FLAT_NAV) {
    if (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)) {
      if (!best || item.to.length > best.to.length) best = item
    }
  }
  return best
}

// Global search.
//
// It searches the STUDENT ROSTER and nothing else, and the placeholder says so.
// `search:studentSearch` cannot back this box: it requires a `studentSlug` (it
// searches inside ONE student's lessons/keywords/errors) and its arg validator
// declares only { studentSlug, q }, so the sessionToken that queryAdminConvex
// injects would be rejected — and convex/** is off limits (BRIEF.md).
// `students:listStudents` is the authenticated roster query the console
// already uses; one fetch on first focus, filtered locally after that.
const SEARCH_LIMIT = 8

function ConsoleSearch() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [roster, setRoster] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef(null)
  const aliveRef = useRef(true)

  useEffect(() => () => { aliveRef.current = false }, [])

  // Typing is debounced; the roster itself is fetched once.
  useEffect(() => {
    const handle = setTimeout(() => {
      setTerm(text.trim().toLowerCase())
      setCursor(0)
    }, 180)
    return () => clearTimeout(handle)
  }, [text])

  function loadRoster() {
    if (status !== 'idle') return
    setStatus('loading')
    queryAdminConvex('students:listStudents', {})
      .then(rows => {
        if (!aliveRef.current) return
        setRoster((rows || []).filter(s => s.status !== 'archived'))
        setStatus('ready')
      })
      .catch(() => { if (aliveRef.current) setStatus('error') })
  }

  const matches = useMemo(() => {
    if (term.length < 2 || !roster) return []
    const hits = roster.filter(s =>
      `${s.name || ''} ${s.slug || ''} ${s.email || ''}`.toLowerCase().includes(term))
    // Name-prefix matches first; the rest keep roster order.
    hits.sort((a, b) => {
      const ap = (a.name || '').toLowerCase().startsWith(term) ? 0 : 1
      const bp = (b.name || '').toLowerCase().startsWith(term) ? 0 : 1
      return ap - bp
    })
    return hits.slice(0, SEARCH_LIMIT)
  }, [term, roster])

  const showPop = open && term.length >= 2

  function pick(student) {
    if (!student) return
    setOpen(false)
    setText('')
    setTerm('')
    navigate(`${ROOT}/academic/roster/${encodeURIComponent(student.slug)}/heatmap`)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!showPop || matches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => (c + 1) % matches.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => (c - 1 + matches.length) % matches.length) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(matches[cursor]) }
  }

  return (
    <form
      className="sa-search"
      role="search"
      ref={rootRef}
      onSubmit={e => { e.preventDefault(); pick(matches[cursor]) }}
      onBlur={e => { if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false) }}
    >
      <span className="material-symbols-outlined" aria-hidden="true">search</span>
      <label htmlFor="sa-global-search" className="sa-sr-only">Search students</label>
      <input
        id="sa-global-search"
        type="text"
        name="q"
        role="combobox"
        aria-expanded={showPop}
        aria-controls="sa-search-results"
        aria-autocomplete="list"
        aria-activedescendant={showPop && matches.length ? `sa-search-opt-${cursor}` : undefined}
        value={text}
        onFocus={() => { loadRoster(); setOpen(true) }}
        onChange={e => { setText(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder="Search students…"
        autoComplete="off"
      />

      {showPop && (
        <ul className="sa-search-pop" id="sa-search-results" role="listbox" aria-label="Student results">
          {/* Non-option rows are presentational so the listbox stays valid. */}
          {status === 'loading' && <li role="presentation" className="sa-search-note">Loading the roster…</li>}
          {status === 'error' && <li role="presentation" className="sa-search-note">Roster unavailable — reload and try again.</li>}
          {status === 'ready' && matches.length === 0 && (
            <li role="presentation" className="sa-search-note">No student matches “{term}”.</li>
          )}
          {matches.map((s, i) => (
            <li
              key={s._id}
              id={`sa-search-opt-${i}`}
              role="option"
              aria-selected={i === cursor}
              className="sa-search-option"
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(s)}
            >
              <span className="sa-search-option-name">{s.name}</span>
              <span className="sa-search-option-meta">{s.level || '—'} · keyword heatmap</span>
            </li>
          ))}
        </ul>
      )}

      <span className="sa-sr-only" role="status" aria-live="polite">
        {showPop && status === 'ready' ? `${matches.length} student results` : ''}
      </span>
    </form>
  )
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function SuperadminLayout() {
  const { adminUser, isSuperadmin, adminLogout } = useAdminAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navRef = useRef(null)

  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* private mode */ }
  }, [collapsed])

  // Route change closes the mobile drawer.
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = e => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const current = useMemo(() => matchNav(location.pathname), [location.pathname])

  // Roving arrow-key navigation across the whole rail, groups included.
  function onNavKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const links = Array.from(navRef.current?.querySelectorAll('a.sa-sidebar-link') || [])
    if (!links.length) return
    const at = links.indexOf(document.activeElement)
    let next
    if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = links.length - 1
    else if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % links.length
    else next = at < 0 ? links.length - 1 : (at - 1 + links.length) % links.length
    e.preventDefault()
    links[next].focus()
  }

  if (!adminUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!isSuperadmin) {
    return <Navigate to="/admin" replace />
  }

  return (
    // One provider around the whole shell: the topbar switcher and every
    // routed School screen must read the SAME selected school.
    <SchoolProvider>
      <div className="sa-root">
        <div className="sa-shell">
          {drawerOpen && (
            <div className="sa-sidebar-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          )}

          <aside
            className="sa-sidebar"
            data-collapsed={collapsed ? 'true' : 'false'}
            data-open={drawerOpen ? 'true' : 'false'}
            aria-label="Console sections"
          >
            <Link to={ROOT} className="sa-sidebar-brand">
              <span className="sa-sidebar-mark">
                <span className="material-symbols-outlined">shield_person</span>
              </span>
              <span className="sa-sidebar-wordmark">
                English Metro
                <small>Superadmin</small>
              </span>
            </Link>

            <nav className="sa-sidebar-scroll" ref={navRef} onKeyDown={onNavKeyDown}>
              {NAV_GROUPS.map((group, gi) => (
                <div className="sa-sidebar-group" key={group.group || 'root'}>
                  {group.group && (
                    <>
                      {gi > 0 && <div className="sa-sidebar-group-rule" aria-hidden="true" />}
                      <div className="sa-sidebar-group-label" id={`sa-navgroup-${group.group}`}>
                        {group.group}
                      </div>
                    </>
                  )}
                  <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}
                    aria-labelledby={group.group ? `sa-navgroup-${group.group}` : undefined}>
                    {group.items.map(item => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          title={collapsed ? item.label : undefined}
                          className={({ isActive }) => `sa-sidebar-link${isActive ? ' is-active' : ''}`}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                          <span className="sa-sidebar-link-text">{item.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="sa-sidebar-foot">
              <button
                type="button"
                className="sa-sidebar-link"
                style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer', font: 'inherit' }}
                onClick={() => setCollapsed(v => !v)}
                aria-pressed={collapsed}
                // The text label is display:none while collapsed and the icon is
                // aria-hidden, so the button carries its own name and tooltip.
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {collapsed ? 'chevron_right' : 'chevron_left'}
                </span>
                <span className="sa-sidebar-link-text">Collapse</span>
              </button>
            </div>
          </aside>

          <div className="sa-main">
            <header className="sa-topbar">
              <button
                type="button"
                className="sa-icon-btn sa-nav-toggle"
                onClick={() => setDrawerOpen(v => !v)}
                aria-label="Toggle navigation"
                aria-expanded={drawerOpen}
              >
                <span className="material-symbols-outlined">menu</span>
              </button>

              <nav className="sa-breadcrumb" aria-label="Breadcrumb">
                <Link to={ROOT} className="sa-breadcrumb-root" style={{ color: 'inherit', textDecoration: 'none' }}>
                  Console
                </Link>
                {current?.group && (
                  <>
                    <span className="sa-breadcrumb-sep" aria-hidden="true" />
                    <span>{current.group}</span>
                  </>
                )}
                <span className="sa-breadcrumb-sep" aria-hidden="true" />
                {/* No nav entry matches an unknown URL — say so instead of
                    claiming Overview while the 404 route renders. */}
                <strong>{current?.label || 'Not found'}</strong>
              </nav>

              <ConsoleSearch />

              {/* Teachers, students and courses are all org-scoped in Convex and a
                  super_admin has no home org, so the working school is a global
                  control rather than a per-screen filter. */}
              <SchoolSwitcher compact />

              <div className="sa-identity">
                <span className="sa-avatar" aria-hidden="true">{initials(adminUser.name)}</span>
                <span>
                  <span className="sa-identity-name" style={{ display: 'block' }}>{adminUser.name}</span>
                  <span className="sa-identity-role" style={{ display: 'block' }}>Superadmin</span>
                </span>
              </div>

              <button
                type="button"
                className="sa-btn sa-btn-ghost sa-btn-sm"
                onClick={() => { adminLogout(); window.location.assign('/login') }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">logout</span>
                Sign out
              </button>
            </header>

            <main className="sa-content">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </SchoolProvider>
  )
}
