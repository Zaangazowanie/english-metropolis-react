import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { SchoolProvider, SchoolSwitcher } from './SchoolShared.jsx'
import { useAdminAuth, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import './console.css'

const ROOT = '/admin/superadmin'

// ─────────────────────────────────────────────────────────────────────────────
// THE MAP. Mike, 2026-09-03: "it feels unnecessarily complicated ... make use of a
// horizontal header ... colour coded to assist navigation, intuitive, designed for
// women teachers ... will probably be used by other people managing the school."
//
// Six areas across the top, each with its own colour. The colour is not
// decoration: it is set as --area on the shell and repeats on the header
// underline, the active sub-tab, the page-header rule and every card accent, so
// wherever you are in the console you can tell which area you are in without
// reading. The sub-tabs under the header are the only second level; nothing is
// deeper than two clicks from anywhere.
//
// Order is the order of a teacher's day: what needs me now → my students → the
// lessons → what Bajla is saying to people → the money → the school's setup.
// ─────────────────────────────────────────────────────────────────────────────
export const AREAS = [
  {
    key: 'today', label: 'Today', icon: 'sunny', hue: 'violet', to: ROOT, end: true,
    blurb: 'What needs you right now.',
    items: [{ to: ROOT, label: 'Overview', icon: 'space_dashboard', end: true }],
  },
  {
    key: 'students', label: 'Students', icon: 'group', hue: 'rose', to: `${ROOT}/school/students`,
    blurb: 'Every learner, what they see, and how they are doing.',
    items: [
      { to: `${ROOT}/school/students`, label: 'Students', icon: 'group' },
      { to: `${ROOT}/school/preview`, label: 'Student view', icon: 'visibility' },
      { to: `${ROOT}/academic/roster`, label: 'Learning records', icon: 'fact_check' },
      { to: `${ROOT}/academic/groups`, label: 'Groups', icon: 'groups' },
      { to: `${ROOT}/academic/assignments`, label: 'Assignments', icon: 'assignment_ind' },
    ],
  },
  {
    key: 'lessons', label: 'Lessons', icon: 'auto_stories', hue: 'teal', to: `${ROOT}/operations/bookings`,
    blurb: 'Bookings, the calendar, and getting notes to students.',
    items: [
      { to: `${ROOT}/operations/bookings`, label: 'Bookings', icon: 'calendar_month' },
      { to: `${ROOT}/academic/schedule`, label: 'Availability', icon: 'event_available' },
      { to: `${ROOT}/operations/readiness`, label: 'Readiness', icon: 'how_to_reg' },
      { to: `${ROOT}/operations/publishing`, label: 'Notes & publishing', icon: 'publish' },
    ],
  },
  {
    key: 'bajla', label: 'Bajla', icon: 'forum', hue: 'amber', to: `${ROOT}/bajla`,
    blurb: 'Every WhatsApp conversation, and the tickets that come out of them.',
    items: [
      { to: `${ROOT}/bajla`, label: 'Conversations', icon: 'chat', end: true },
      { to: `${ROOT}/bajla/tickets`, label: 'Tickets', icon: 'confirmation_number' },
      { to: `${ROOT}/comms/inbox`, label: 'Email', icon: 'inbox' },
      { to: `${ROOT}/comms/templates`, label: 'Templates', icon: 'article' },
      { to: `${ROOT}/comms/sequences`, label: 'Sequences', icon: 'forward_to_inbox' },
    ],
  },
  {
    key: 'money', label: 'Money', icon: 'payments', hue: 'green', to: `${ROOT}/finance/revenue`,
    blurb: 'Payments in, invoices out, payroll.',
    items: [
      { to: `${ROOT}/finance/revenue`, label: 'Payments', icon: 'payments' },
      { to: `${ROOT}/finance/invoices`, label: 'Invoices', icon: 'receipt_long' },
      { to: `${ROOT}/finance/payroll`, label: 'Payroll', icon: 'account_balance_wallet' },
    ],
  },
  {
    key: 'school', label: 'School', icon: 'apartment', hue: 'blue', to: `${ROOT}/school/schools`,
    blurb: 'Setup, courses, the library, the website and the team.',
    items: [
      { to: `${ROOT}/school/schools`, label: 'Schools', icon: 'apartment' },
      { to: `${ROOT}/school/teachers`, label: 'Teachers', icon: 'co_present' },
      { to: `${ROOT}/academic/students`, label: 'Courses', icon: 'school' },
      { to: `${ROOT}/curriculum/library`, label: 'Library', icon: 'local_library' },
      { to: `${ROOT}/curriculum/ingest`, label: 'Ingest', icon: 'upload_file' },
      { to: `${ROOT}/curriculum/queue`, label: 'Queue', icon: 'pending_actions' },
      { to: `${ROOT}/crm/contacts`, label: 'Contacts', icon: 'contacts' },
      { to: `${ROOT}/crm/companies`, label: 'Companies', icon: 'domain' },
      { to: `${ROOT}/crm/pipeline`, label: 'Pipeline', icon: 'view_kanban' },
      { to: `${ROOT}/growth/campaigns`, label: 'Campaigns', icon: 'campaign' },
      { to: `${ROOT}/growth/adverts`, label: 'Adverts', icon: 'ad_units' },
      { to: `${ROOT}/growth/seo`, label: 'SEO', icon: 'travel_explore' },
      { to: `${ROOT}/website/pages`, label: 'Pages', icon: 'web' },
      { to: `${ROOT}/website/deploys`, label: 'Deploys', icon: 'rocket_launch' },
      { to: `${ROOT}/people/team`, label: 'Team', icon: 'badge' },
      { to: `${ROOT}/people/recruiting`, label: 'Recruiting', icon: 'person_search' },
      { to: `${ROOT}/system/pipelines`, label: 'Pipelines', icon: 'monitor_heart' },
      { to: `${ROOT}/system/audit`, label: 'Audit', icon: 'history' },
      { to: `${ROOT}/system/integrations`, label: 'Integrations', icon: 'cable' },
    ],
  },
]

// Kept for any screen that still imports the old names.
export const NAV_GROUPS = AREAS.map(a => ({ group: a.label, items: a.items }))
export const MORE_NAV_GROUPS = []

const FLAT = AREAS.flatMap(a => a.items.map(item => ({ ...item, area: a })))

function matches(item, pathname) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

// Longest matching item wins, so /academic/groups/:id still resolves to Groups.
function locate(pathname) {
  let best = null
  for (const item of FLAT) {
    if (matches(item, pathname) && (!best || item.to.length > best.to.length)) best = item
  }
  return best
}

const SEARCH_LIMIT = 8

function ConsoleSearch() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [roster, setRoster] = useState(null)
  const [status, setStatus] = useState('idle')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const rootRef = useRef(null)
  const aliveRef = useRef(true)
  useEffect(() => () => { aliveRef.current = false }, [])
  useEffect(() => {
    const handle = setTimeout(() => { setTerm(text.trim().toLowerCase()); setCursor(0) }, 180)
    return () => clearTimeout(handle)
  }, [text])
  function loadRoster() {
    if (status !== 'idle') return
    setStatus('loading')
    queryAdminConvex('students:listStudents', {})
      .then(rows => { if (!aliveRef.current) return; setRoster((rows || []).filter(s => s.status !== 'archived')); setStatus('ready') })
      .catch(() => { if (aliveRef.current) setStatus('error') })
  }
  const hits = useMemo(() => {
    if (term.length < 2 || !roster) return []
    const h = roster.filter(s => `${s.name || ''} ${s.slug || ''} ${s.email || ''}`.toLowerCase().includes(term))
    h.sort((a, b) => ((a.name || '').toLowerCase().startsWith(term) ? 0 : 1) - ((b.name || '').toLowerCase().startsWith(term) ? 0 : 1))
    return h.slice(0, SEARCH_LIMIT)
  }, [term, roster])
  const showPop = open && term.length >= 2
  function pick(s) {
    if (!s) return
    setOpen(false); setText(''); setTerm('')
    navigate(`${ROOT}/school/preview?student=${encodeURIComponent(s.slug)}`)
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!showPop || !hits.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => (c + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => (c - 1 + hits.length) % hits.length) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[cursor]) }
  }
  return (
    <form className="sa-search" role="search" ref={rootRef} onSubmit={e => { e.preventDefault(); pick(hits[cursor]) }}
      onBlur={e => { if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false) }}>
      <span className="material-symbols-outlined" aria-hidden="true">search</span>
      <label htmlFor="sa-global-search" className="sa-sr-only">Search students</label>
      <input id="sa-global-search" type="text" name="q" role="combobox" aria-expanded={showPop}
        aria-controls="sa-search-results" aria-autocomplete="list"
        aria-activedescendant={showPop && hits.length ? `sa-search-opt-${cursor}` : undefined}
        value={text} onFocus={() => { loadRoster(); setOpen(true) }}
        onChange={e => { setText(e.target.value); setOpen(true) }} onKeyDown={onKeyDown}
        placeholder="Find a student…" autoComplete="off" />
      {showPop && (
        <ul className="sa-search-pop" id="sa-search-results" role="listbox" aria-label="Student results">
          {status === 'loading' && <li role="presentation" className="sa-search-note">Loading the roster…</li>}
          {status === 'error' && <li role="presentation" className="sa-search-note">Roster unavailable — reload and try again.</li>}
          {status === 'ready' && hits.length === 0 && <li role="presentation" className="sa-search-note">No student matches “{term}”.</li>}
          {hits.map((s, i) => (
            <li key={s._id} id={`sa-search-opt-${i}`} role="option" aria-selected={i === cursor} className="sa-search-option"
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setCursor(i)} onClick={() => pick(s)}>
              <span className="sa-search-option-name">{s.name}</span>
              <span className="sa-search-option-meta">{s.level || '—'} · open student view</span>
            </li>
          ))}
        </ul>
      )}
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
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const current = useMemo(() => locate(location.pathname), [location.pathname])
  const area = current?.area || AREAS[0]

  if (!adminUser) return <Navigate to="/login" state={{ from: location }} replace />
  if (!isSuperadmin) return <Navigate to="/admin" replace />

  return (
    <SchoolProvider>
      <div className="sa-root sa2" data-area={area.key} data-hue={area.hue}>
        <header className="sa2-header">
          <div className="sa2-bar">
            <Link to={ROOT} className="sa2-brand" aria-label="English Metro console home">
              <span className="sa2-mark" aria-hidden="true">🕊️</span>
              <span className="sa2-word">English <em>Metro</em><small>console</small></span>
            </Link>

            <nav className="sa2-areas" aria-label="Areas">
              {AREAS.map(a => (
                <NavLink key={a.key} to={a.to} end={a.end}
                  className={() => `sa2-area${area.key === a.key ? ' is-active' : ''}`}
                  data-hue={a.hue} title={a.blurb}>
                  <span className="material-symbols-outlined" aria-hidden="true">{a.icon}</span>
                  <span>{a.label}</span>
                </NavLink>
              ))}
            </nav>

            <ConsoleSearch />
            <SchoolSwitcher compact />

            <div className="sa2-identity" title={adminUser.email || ''}>
              <span className="sa-avatar" aria-hidden="true">{initials(adminUser.name)}</span>
              <span className="sa2-identity-text">
                <strong>{adminUser.name}</strong>
                <small>Superadmin</small>
              </span>
            </div>
            <button type="button" className="sa-icon-btn" onClick={() => { adminLogout(); window.location.assign('/login') }}
              aria-label="Sign out" title="Sign out">
              <span className="material-symbols-outlined">logout</span>
            </button>
            <button type="button" className="sa-icon-btn sa2-menu-btn" onClick={() => setMenuOpen(v => !v)}
              aria-label="Open menu" aria-expanded={menuOpen}>
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>

          <nav className="sa2-sub" aria-label={`${area.label} sections`}>
            <span className="sa2-sub-area">
              <span className="material-symbols-outlined" aria-hidden="true">{area.icon}</span>
              {area.label}
            </span>
            <div className="sa2-tabs">
              {area.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  className={({ isActive }) => `sa2-tab${isActive || (current && current.to === item.to) ? ' is-active' : ''}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </header>

        {menuOpen && (
          <div className="sa2-drawer-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true">
            <div className="sa2-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-label="All sections">
              {AREAS.map(a => (
                <section key={a.key} className="sa2-drawer-area" data-hue={a.hue}>
                  <h3><span className="material-symbols-outlined" aria-hidden="true">{a.icon}</span>{a.label}<small>{a.blurb}</small></h3>
                  <ul>
                    {a.items.map(item => (
                      <li key={item.to}><NavLink to={item.to} end={item.end}>{item.label}</NavLink></li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        <main className="sa-content sa2-content">
          <Outlet />
        </main>
      </div>
    </SchoolProvider>
  )
}
